// Standalone terminals: process kept alive across restarts by the self-owned
// PTY host (RFC 0010); screen + scrollback persisted/restored via the xterm.js
// SerializeAddon (VS Code-style "process revive").
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { subscribe, useSnapshot } from "valtio";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { SerializeAddon } from "@xterm/addon-serialize";
import { SearchAddon } from "@xterm/addon-search";
import {
  nextMouseEncoding,
  withRestoredMouseEncoding,
  type MouseEncoding,
} from "./terminal-mouse-encoding";
import { shouldPaintChunk } from "./terminal-replay";
import {
  AgentIconGlyph,
  DND_MIME,
  type DockPanelProps,
  type Disposable,
  type EditorService,
  type ExtensionContext,
  type MenuEntry,
  type ProcessSession,
  type TerminalRecord,
} from "@silo-code/sdk";
import {
  store,
  recreateTerminal,
  tauriTerminalClient,
  logTerminalAttachTrace,
  getThemeBase,
  retryFocus,
  useFocusOnActive,
  onTerminalForeground,
  terminalForegroundSnapshot,
  registerSelectionSource,
  contextMenuEntriesFor,
  notifyTerminalSessionGone,
  notifyTerminalSessionRecreated,
  stripAgentStatusMarkers,
  stripAgentTitleIdentityPrefix,
  spawnTerminalSession,
  drainPendingLaunch,
  getAgentProfiles,
  profileLaunchLine,
  readClipboardText,
  registerTerminalClear,
  setTerminalFocus,
  menuAcceleratorForCommand,
  type TerminalForeground,
} from "@silo-code/extension-host/internal";
import { xtermThemeFor } from "./xterm-theme";
import { effectiveFontFamily } from "./terminal-font";
import { buildTerminalPaste } from "./terminal-path-paste";
import { findFileLinks, getHomeDir } from "./terminal-links";
import { resolveTerminalFilePath } from "./terminal-open-file";
import {
  isLinkActivationClick,
  linkMenuLabels,
  linkTooltipText,
  type HoveredTerminalLink,
  type TerminalLinkRange,
} from "./terminal-link-policy";
import {
  findTerminalOwnerId,
  planCancelledInit,
  planExitStreamEnd,
  planSessionGoneAfterAttach,
} from "./terminal-lifecycle";
import {
  beginTerminalRestoreAttach,
  endTerminalRestoreAttach,
} from "./terminal-restore-busy";
import { deriveTitle, formatTitle, tmuxStatusTitle } from "./terminal-title";
import { formatResumeBox } from "./resume-box";
import { TerminalSearch } from "./TerminalSearch";
import { Breadcrumb } from "../editor/Breadcrumb";
import { ContributedToolbar } from "../shared/ContributedToolbar";
import "@xterm/xterm/css/xterm.css";
import "./TerminalPanel.css";

const isMac = navigator.platform.toUpperCase().includes("MAC");
const isWindows = navigator.platform.toUpperCase().startsWith("WIN");

function resolvedFontFamily(): string {
  return effectiveFontFamily(
    store.terminalSettings.fontFamily,
    isWindows,
    isMac,
  );
}

function effectiveFontSize(): number {
  return store.uiFontSize + store.terminalSettings.fontSizeOffset + 0.5;
}
const cmdKey = isMac ? "⌘" : "Ctrl";

// Matches the hover delay of the shared `Tooltip` component (packages/sdk/src/Tooltip.tsx)
// so terminal link tooltips feel consistent with the rest of the app.
const LINK_TOOLTIP_DELAY_MS = 600;

// xterm's built-in OSC-8/web-link fallback opens via `window.open()`, which
// the Tauri webview doesn't hand off to the OS the way a real browser does.
// Route through the host's opener (the same path menu items and extensions
// use) instead.
function openTerminalLink(ctx: ExtensionContext, uri: string): void {
  void ctx.ui.openExternal(uri).catch((err: unknown) => {
    console.warn("[terminal] failed to open external link", uri, err);
  });
}

export interface TerminalPanelParams {
  terminalId: string;
}

type Lifecycle =
  | { kind: "loading" }
  | { kind: "ready"; sessionId: string }
  | { kind: "stale"; sessionId: string; message: string }
  | { kind: "exited"; sessionId: string; exitCode: number };

interface LiveRefs {
  term: XTerm;
  fit: FitAddon;
  search: SearchAddon;
  session: ProcessSession;
  sessionId: string;
  /**
   * Serialize the current buffer and persist it immediately, bypassing the
   * throttle timer below. Set once `persistBuffer` exists, just after this ref
   * is populated — undefined only in the brief window before that. Without
   * this, `ctxClear`'s screen clear was invisible to the persisted snapshot
   * until the next throttle tick, so a restart in that window (or a tick that
   * lost the race) resurrected the pre-clear scrollback.
   */
  persistNow?: () => void;
}

async function openFileFromTerminal(
  matched: string,
  terminalId: string,
  editors: EditorService,
): Promise<void> {
  // Find the workspace that owns this terminal (don't assume the active one).
  const wsId = findTerminalOwnerId(Object.values(store.workspaces), terminalId);
  if (!wsId) return;
  const ws = store.workspaces[wsId];
  const tRec = ws.terminals.find((t) => t.id === terminalId);

  // Relative paths resolve against the terminal's cwd (which may be a
  // worktree or extra folder), not the workspace's primary folder.
  let baseDir = tRec?.cwd ?? ws.folder;
  if (tRec?.sessionId) {
    const fg = await terminalForegroundSnapshot(tRec.sessionId);
    if (fg?.cwd) baseDir = fg.cwd;
  }

  const home = matched.startsWith("~/") ? await getHomeDir() : undefined;
  const path = resolveTerminalFilePath(matched, baseDir, home);

  editors.open(path, { workspaceId: wsId });
}

export function TerminalPanel(
  props: DockPanelProps<TerminalPanelParams> & { ctx: ExtensionContext },
) {
  const { terminalId } = props.params;
  const { ctx } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const liveRef = useRef<LiveRefs | null>(null);
  // Active disposer for this terminal's selection source (registered while focused).
  const selSourceRef = useRef<Disposable | null>(null);
  // The link (if any) currently under the pointer, across all three link
  // mechanisms (OSC-8, WebLinksAddon, file-path provider) — see ADR 0027.
  // Read by onContextMenu (right-click selects + shows link actions) and by
  // the tooltip below. A ref because it's written from xterm's hover
  // callbacks, which fire far more often than a render can usefully follow.
  const hoveredLinkRef = useRef<HoveredTerminalLink | null>(null);
  const linkTooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [linkTooltip, setLinkTooltip] = useState<{
    x: number;
    y: number;
    text: string;
  } | null>(null);
  // Live working directory of the terminal's foreground process (RFC 0010 N2),
  // updated from foreground events. The ref feeds "New Terminal Here" (sync,
  // no re-render needed); the state drives the breadcrumb bar.
  const cwdRef = useRef<string>("");
  const [cwd, setCwd] = useState<string>("");
  // Only the breadcrumb-enabled flag is read reactively (valtio tracks the
  // accessed path), so this doesn't re-render on unrelated store changes.
  const showBreadcrumb = useSnapshot(store).terminalSettings.breadcrumbs;
  const [lifecycle, setLifecycle] = useState<Lifecycle>({ kind: "loading" });
  // Bumping this re-runs the attach effect (used by the Recreate button).
  const [version, setVersion] = useState(0);
  // When auto-recreating after a 404, holds the stale sessionId so the next
  // init() run can replay its persisted buffer into the fresh session.
  const replayFromRef = useRef<string>("");
  // After a data-stream EOF we remount to reattach (false Process-exited). These
  // track the original exit code (for the overlay if the host is truly gone)
  // and how many reconnects we've already spent without a sustained ready.
  const pendingExitCodeRef = useRef<number | null>(null);
  const exitReconnectCountRef = useRef(0);
  // Find overlay (Cmd+F). `seed` carries the terminal's current selection into
  // the search box at open time; bumping `nonce` re-focuses the box if Cmd+F is
  // pressed while it's already open.
  const [search, setSearch] = useState<{
    open: boolean;
    seed: string;
    nonce: number;
  }>({ open: false, seed: "", nonce: 0 });

  const recreate = useCallback(() => {
    // Read activeWorkspaceId at click time to avoid stale closure.
    const wsId = store.activeWorkspaceId;
    if (!wsId) return;
    const rec = store.workspaces[wsId]?.terminals.find(
      (t) => t.id === terminalId,
    );
    if (!rec) return;
    logTerminalAttachTrace("ui_recreate", {
      terminalId,
      workspaceId: wsId,
      priorSessionId: rec.sessionId || undefined,
      reason: "user-button",
    });
    recreateTerminal(wsId, terminalId);
    setLifecycle({ kind: "loading" });
    // Force re-initialize by bumping version.
    setVersion((v) => v + 1);
  }, [terminalId]);
  // Called when the panel may have become a wrong/stale size. fits xterm to
  // its container and unconditionally pushes the resulting cols/rows to
  // the terminal backend (Claude Code and other TUIs only redraw on SIGWINCH, so we
  // need the resize to reach the PTY even if xterm thinks the size is
  // unchanged from its last fit).
  const forceRefit = useCallback(() => {
    const live = liveRef.current;
    if (!live) return;
    const host = containerRef.current;
    if (!host) return;
    if (host.clientWidth < 10 || host.clientHeight < 10) return;
    try {
      live.fit.fit();
    } catch {
      return;
    }
    const { cols, rows, term } = {
      ...live,
      cols: live.term.cols,
      rows: live.term.rows,
    };
    if (cols < 2 || rows < 2) return;
    live.session.resize(cols, rows);
    // Force xterm to redraw — when coming back from display:none the canvas
    // may show stale pixels.
    try {
      term.refresh(0, term.rows - 1);
    } catch {
      /* no-op */
    }
  }, []);

  // Shared hover/tooltip plumbing for every link provider (ADR 0027): each
  // provider's `hover`/`leave` callback funnels into these two, so the
  // tooltip text and the right-click "what's under the pointer" state stay
  // consistent no matter which mechanism found the link.
  const showLinkTooltip = useCallback(
    (
      event: MouseEvent,
      kind: HoveredTerminalLink["kind"],
      text: string,
      range: TerminalLinkRange,
    ) => {
      hoveredLinkRef.current = { kind, text, range };
      if (linkTooltipTimerRef.current)
        clearTimeout(linkTooltipTimerRef.current);
      const x = event.clientX;
      const y = event.clientY;
      linkTooltipTimerRef.current = setTimeout(() => {
        setLinkTooltip({ x, y, text: linkTooltipText(kind, isMac) });
      }, LINK_TOOLTIP_DELAY_MS);
    },
    [],
  );

  const hideLinkTooltip = useCallback(() => {
    hoveredLinkRef.current = null;
    if (linkTooltipTimerRef.current) {
      clearTimeout(linkTooltipTimerRef.current);
      linkTooltipTimerRef.current = null;
    }
    setLinkTooltip(null);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      fontFamily: resolvedFontFamily(),
      fontSize: effectiveFontSize(),
      lineHeight: 1.2,
      letterSpacing: 0.4,
      cursorBlink: true,
      cursorStyle: store.terminalSettings.cursorStyle,
      theme: xtermThemeFor(getThemeBase(store.activeThemeId)),
      scrollback: 10_000,
      scrollSensitivity: store.terminalSettings.scrollSensitivity,
      fastScrollSensitivity: store.terminalSettings.fastScrollSensitivity,
      // xterm hand-draws box-drawing/block glyphs (U+2500 etc.) with vector
      // paths instead of the font. Its WebGL renderer mis-draws some of those
      // cells as artifacts (e.g. blobs on pi's ──── separators), so render box
      // glyphs from the font instead. Regular text is unaffected.
      customGlyphs: false,
      allowProposedApi: true,
      // Overrides xterm's default OSC-8 hyperlink activation (see
      // openTerminalLink above for why the default doesn't work here) and
      // applies the shared link policy (ADR 0027): Cmd/Ctrl+click to open,
      // hover shows a tooltip, plain click is a no-op.
      linkHandler: {
        activate: (event, uri) => {
          if (!isLinkActivationClick(event, isMac)) return;
          openTerminalLink(ctx, uri);
        },
        hover: (event, text, range) =>
          showLinkTooltip(event, "url", text, range),
        leave: () => hideLinkTooltip(),
      },
    });
    // xterm v6 removed the bellStyle option; subscribe to onBell with a no-op
    // to suppress any audio the WebView would otherwise play on BEL (0x07).
    term.onBell(() => {});
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(
      new WebLinksAddon(
        (event, uri) => {
          if (!isLinkActivationClick(event, isMac)) return;
          openTerminalLink(ctx, uri);
        },
        {
          // WebLinksAddon reports hover position in viewport-relative,
          // 0-based coordinates; convert to the same buffer-absolute,
          // 1-based coordinates the other two link providers use (see
          // terminal-link-policy.ts) so right-click "select the link" works
          // identically no matter which provider found it.
          hover: (event, text, location) => {
            const viewportY = term.buffer.active.viewportY;
            const range: TerminalLinkRange = {
              start: {
                x: location.start.x + 1,
                y: viewportY + location.start.y + 1,
              },
              end: {
                x: location.end.x + 1,
                y: viewportY + location.end.y + 1,
              },
            };
            showLinkTooltip(event, "url", text, range);
          },
          leave: () => hideLinkTooltip(),
        },
      ),
    );
    // SerializeAddon dumps the buffer (screen + scrollback, alt-screen aware) to
    // a self-contained string we persist for restore — the same mechanism VS
    // Code uses for terminal "process revive".
    const serializeAddon = new SerializeAddon();
    term.loadAddon(serializeAddon);
    // Find-in-terminal (Cmd+F). The overlay (TerminalSearch) drives it; the
    // addon does the matching/highlighting over the scrollback buffer.
    const searchAddon = new SearchAddon();
    term.loadAddon(searchAddon);
    term.open(containerRef.current);
    fit.fit();

    // Re-apply theme after first paint so we pick up any custom-theme CSS
    // variables that ThemeInjector may have injected concurrently with our
    // mount. Without this, the WebGL canvas can latch onto the built-in
    // base palette before the override styles land.
    requestAnimationFrame(() => {
      term.options.theme = xtermThemeFor(getThemeBase(store.activeThemeId));
    });

    // WebGL renderer fixes italic (SGR 3) and dim (SGR 2) — the DOM renderer
    // in @xterm/xterm v6 mis-styles both on macOS. Skipped on Windows because
    // the WebGL addon can hang or crash in Webview2 environments.
    if (!isWindows) {
      try {
        const webgl = new WebglAddon();
        webgl.onContextLoss(() => webgl.dispose());
        term.loadAddon(webgl);
        console.info("[terminal] WebGL renderer attached");
      } catch (err) {
        console.warn(
          "[terminal] WebGL renderer unavailable, falling back to DOM",
          err,
        );
      }
    }

    term.registerLinkProvider({
      provideLinks(bufferLineNumber, callback) {
        callback(
          findFileLinks(term, bufferLineNumber, {
            isMac,
            onActivate: (text) =>
              openFileFromTerminal(text, terminalId, ctx.editors),
            onHover: (event, text, range) =>
              showLinkTooltip(event, "path", text, range),
            onLeave: () => hideLinkTooltip(),
          }),
        );
      },
    });

    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        /* container size 0 */
      }
    });
    ro.observe(containerRef.current);

    // Live-update xterm's font size and theme when the store changes.
    let lastThemeId: string = store.activeThemeId;
    let lastTerminalBg: string = "";
    const unsubFont = subscribe(store, () => {
      const newSize = effectiveFontSize();
      if (term.options.fontSize !== newSize) {
        term.options.fontSize = newSize;
        try {
          fit.fit();
        } catch {
          /* no-op */
        }
      }
      const newFamily = resolvedFontFamily();
      if (term.options.fontFamily !== newFamily) {
        term.options.fontFamily = newFamily;
        try {
          fit.fit();
        } catch {
          /* no-op */
        }
      }
      if (term.options.cursorStyle !== store.terminalSettings.cursorStyle) {
        term.options.cursorStyle = store.terminalSettings.cursorStyle;
      }
      if (
        term.options.scrollSensitivity !==
        store.terminalSettings.scrollSensitivity
      ) {
        term.options.scrollSensitivity =
          store.terminalSettings.scrollSensitivity;
      }
      if (
        term.options.fastScrollSensitivity !==
        store.terminalSettings.fastScrollSensitivity
      ) {
        term.options.fastScrollSensitivity =
          store.terminalSettings.fastScrollSensitivity;
      }
      const themeChanged = store.activeThemeId !== lastThemeId;
      // Also detect live edits to --silo-content-terminal-bg in the active custom theme
      const activeCustom = store.customThemes.find(
        (t) => t.id === store.activeThemeId,
      );
      const currentTerminalBg =
        activeCustom?.vars["--silo-content-terminal-bg"] ?? "";
      const terminalBgChanged = currentTerminalBg !== lastTerminalBg;

      if (themeChanged || terminalBgChanged) {
        lastThemeId = store.activeThemeId;
        lastTerminalBg = currentTerminalBg;
        // Defer one tick so ThemeInjector's CSS variable updates have
        // landed in the DOM before we read them.
        queueMicrotask(() => {
          term.options.theme = xtermThemeFor(getThemeBase(store.activeThemeId));
        });
      }
    });

    const disposers: Array<() => void> = [];

    // See terminal-mouse-encoding.ts: xterm's SerializeAddon can't capture
    // which mouse-reporting encoding a TUI selected, so track it ourselves
    // via the public CSI-handler API for persistBuffer() below to fold in.
    let mouseEncoding: MouseEncoding = null;
    const decsetSub = term.parser.registerCsiHandler(
      { prefix: "?", final: "h" },
      (params) => {
        mouseEncoding = nextMouseEncoding(mouseEncoding, params, true);
        return false; // don't suppress xterm's own DECSET handling
      },
    );
    const decrstSub = term.parser.registerCsiHandler(
      { prefix: "?", final: "l" },
      (params) => {
        mouseEncoding = nextMouseEncoding(mouseEncoding, params, false);
        return false; // don't suppress xterm's own DECRST handling
      },
    );
    disposers.push(() => decsetSub.dispose());
    disposers.push(() => decrstSub.dispose());

    // Copy-on-select: on mouse release (so we don't fire mid-drag), copy the
    // selection and clear it. Reads the setting live so the toggle takes effect
    // without a remount.
    const hostEl = containerRef.current;
    const onMouseUp = () => {
      if (!store.terminalSettings.copyOnSelect) return;
      const sel = term.getSelection();
      if (sel) {
        void navigator.clipboard.writeText(sel);
        term.clearSelection();
      }
    };
    hostEl?.addEventListener("mouseup", onMouseUp);
    disposers.push(() => hostEl?.removeEventListener("mouseup", onMouseUp));

    // Paste on right-click: do it from `auxclick` (a real click gesture) rather
    // than `contextmenu` (which doesn't carry the same user-activation semantics).
    const onAuxClick = (e: MouseEvent) => {
      if (e.button === 2 && store.terminalSettings.pasteOnRightClick) {
        void ctxPaste();
      }
    };
    hostEl?.addEventListener("auxclick", onAuxClick);
    disposers.push(() => hostEl?.removeEventListener("auxclick", onAuxClick));

    let cancelled = false;

    const activeWsId = store.activeWorkspaceId;
    const ws = activeWsId ? store.workspaces[activeWsId] : null;
    const tRec = ws?.terminals.find((t) => t.id === terminalId) ?? null;

    async function init() {
      if (!ws || !tRec) {
        const ownerWsId = findTerminalOwnerId(
          Object.values(store.workspaces),
          terminalId,
        );
        logTerminalAttachTrace("ui_init_miss", {
          terminalId,
          activeWorkspaceId: activeWsId,
          ownerWorkspaceId: ownerWsId,
          activeHasWorkspace: Boolean(ws),
          reason: !ws ? "no-active-workspace" : "terminal-not-in-active-ws",
        });
        setLifecycle({
          kind: "stale",
          sessionId: "",
          message: "Terminal record not found.",
        });
        return;
      }
      // Defer one frame so the FitAddon has a non-zero container size to
      // measure against. Without this, a panel mounted inside a freshly-
      // visible dock can start out at cols=1 or rows=1 because the dock
      // layout hadn't propagated yet.
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      try {
        fit.fit();
      } catch {
        /* ignore */
      }
      const cols = Math.max(20, term.cols);
      const rows = Math.max(5, term.rows);
      try {
        const needsCreate = !tRec.sessionId;
        logTerminalAttachTrace(
          needsCreate ? "ui_spawn_start" : "ui_attach_start",
          {
            terminalId,
            workspaceId: activeWsId,
            sessionId: tRec.sessionId || undefined,
            kind: tRec.kind,
            cols,
            rows,
          },
        );
        if (!needsCreate) beginTerminalRestoreAttach();
        let restoreEnded = needsCreate;
        const endRestore = (ok: boolean) => {
          if (restoreEnded) return;
          restoreEnded = true;
          endTerminalRestoreAttach(ok);
        };
        let session;
        try {
          session = needsCreate
            ? // The privileged spawn, not `ctx.process.spawn`: this session IS
              // the tab, so it carries the tab's id as `SILO_TERMINAL_ID`
              // (RFC 0028).
              await spawnTerminalSession({
                terminalId,
                cwd: tRec.cwd ?? ws.folder,
                cols,
                rows,
              })
            : await ctx.process.attach(tRec.sessionId, { cols, rows });
        } catch (err) {
          // Session gone → recreate path below is recovery, not a user-facing
          // reconnect failure. Other attach errors do count toward the notify.
          const e = err as Error & { status?: number };
          endRestore(e.status === 404);
          throw err;
        }
        if (cancelled) {
          endRestore(true);
          // This run is being abandoned while holding a live session. A session
          // it *spawned* is referenced by nothing (the `tRec.sessionId`
          // assignment is below this bail), so it would leak as a shell with no
          // tab — reap it, exactly as `ensureSession` reaps its own orphan. A
          // session it merely *attached* to belongs to the record and the user;
          // killing that one would destroy a live terminal.
          const plan = planCancelledInit({ needsCreate });
          if (plan === "reap") void session.kill();
          logTerminalAttachTrace("ui_init_cancelled", {
            terminalId,
            workspaceId: activeWsId,
            sessionId: session.id,
            needsCreate,
            disposition: plan,
          });
          return;
        }
        endRestore(true);
        const sessionId = session.id;
        logTerminalAttachTrace(needsCreate ? "ui_spawn_ok" : "ui_attach_ok", {
          terminalId,
          workspaceId: activeWsId,
          sessionId,
          kind: tRec.kind,
        });

        if (needsCreate) tRec.sessionId = sessionId;

        liveRef.current = {
          term,
          fit,
          search: searchAddon,
          session,
          sessionId,
          persistNow: () => {
            saveDirty = false;
            persistBuffer();
          },
        };

        // Publish the terminal's selection to the active-selection registry
        // while it has focus, so `ctx.ui.getActiveSelectionText()` (e.g. the
        // Search panel's Cmd+Shift+F) can read it. Cleared on blur / teardown.
        const onTermFocus = () => {
          setTerminalFocus(terminalId);
          selSourceRef.current?.dispose();
          selSourceRef.current = registerSelectionSource(
            () => liveRef.current?.term.getSelection() || null,
          );
        };
        const onTermBlur = () => {
          setTerminalFocus(null);
          selSourceRef.current?.dispose();
          selSourceRef.current = null;
        };
        term.textarea?.addEventListener("focus", onTermFocus);
        term.textarea?.addEventListener("blur", onTermBlur);
        disposers.push(() => {
          term.textarea?.removeEventListener("focus", onTermFocus);
          term.textarea?.removeEventListener("blur", onTermBlur);
          selSourceRef.current?.dispose();
          selSourceRef.current = null;
        });

        // Persist the serialized buffer (screen + scrollback) on a throttle so a
        // restart can restore it. A timer-driven flush (rather than persisting
        // per byte) also captures the final state after output goes idle.
        let saveDirty = false;
        const persistBuffer = () => {
          try {
            const data = withRestoredMouseEncoding(
              serializeAddon.serialize({ scrollback: 2000 }),
              mouseEncoding,
              term.modes.mouseTrackingMode,
            );
            session.saveBuffer(data);
          } catch (err) {
            console.warn("[terminal] serialize failed", err);
          }
        };

        // Register the output listener BEFORE replaying recovered history. Live
        // output (notably the shell's reattach redraw) is buffered until the
        // restored snapshot has been written, then flushed in order — so the
        // redraw and cursor land after the history, not baked into the replay.
        let replayed = needsCreate; // created sessions have nothing to replay
        // Whether the persisted `SerializeAddon` buffer supplied any scrollback
        // on this attach. Decides what happens to the session host's own ring
        // replay: see `shouldPaintChunk` (RFC 0036 / issue #500).
        let restoredFromBuffer = false;
        const pending: Array<{ data: string; replay: boolean }> = [];
        let lastActivityWrite = 0;
        const writeLive = (data: string) => {
          term.write(data);
          saveDirty = true;
          const now = Date.now();
          if (now - lastActivityWrite > 10_000) {
            lastActivityWrite = now;
            tRec!.lastActiveAt = new Date(now).toISOString();
          }
        };
        const deliver = (data: string, replay: boolean) => {
          if (!shouldPaintChunk(replay, restoredFromBuffer)) return;
          // Replayed scrollback is history, not activity: paint it, but don't
          // mark the buffer dirty or bump `lastActiveAt` for output that
          // finished before this attach.
          if (replay) {
            term.write(data);
            return;
          }
          writeLive(data);
        };
        // Opt in to the ring replay: it is the only scrollback there is when no
        // persisted buffer exists. Everything the session host sends is held
        // until the restore below settles, because whether to paint the replay
        // depends on what that restore produced.
        const outSub = session.onData(
          (data, { replay }) => {
            if (!replayed) {
              pending.push({ data, replay });
              return;
            }
            deliver(data, replay);
          },
          { includeReplay: true },
        );

        // Restore the previous buffer on attach, then release buffered output.
        if (!needsCreate) {
          const restored = await session.getBuffer();
          if (restored.length > 0) {
            term.write(restored);
          }
          restoredFromBuffer = restored.length > 0;
          replayed = true;
          for (const p of pending) deliver(p.data, p.replay);
          pending.length = 0;
        } else if (replayFromRef.current) {
          // Auto-recreated after a 404: replay the old session's persisted buffer
          // so scrollback survives the reboot, then flush any live output.
          const oldSessionId = replayFromRef.current;
          replayFromRef.current = "";
          const restored =
            await tauriTerminalClient.getTerminalBuffer(oldSessionId);
          if (restored.length > 0) {
            term.write(restored);
          }
          // The replayed buffer is a snapshot of whatever the old session's
          // live state was — if a full-screen program (e.g. Claude Code) had
          // mouse tracking enabled and the process was killed abruptly rather
          // than exiting cleanly, there's no matching disable sequence in the
          // snapshot, so replaying it leaves this (reused, not fresh) xterm
          // instance stuck in mouse-tracking mode: click-drag stops
          // selecting text and instead sends tracking bytes to the PTY.
          // Force these off explicitly rather than trusting the snapshot.
          // Deliberately not touching alternate-screen-buffer mode (1049) —
          // toggling that risks revealing/hiding content rather than just
          // fixing input routing, and nothing observed here implicates it.
          term.write("\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[?2004l");
          // ctx.agents (RFC 0018): the resume hint notifyTerminalSessionGone
          // resolved above, if any, appended as inert text before the fresh
          // prompt — then clear "dead" back to a fresh state now that a live
          // session has taken over this terminal id.
          const agentInfo = ctx.agents.getByTerminalId(terminalId);
          if (agentInfo?.activity === "dead" && agentInfo.resumeCommand) {
            // Exact hint (a real `<agent> --resume <id>` command, gated on a
            // captured sessionId) gets the two-line "resume with" form; the
            // generic "was running … in …" hint has nothing to run, so it
            // rides on the header line instead.
            const header = "Terminal restarted, agent terminated.";
            const lines = agentInfo.sessionId
              ? [`${header} Resume with:`, agentInfo.resumeCommand]
              : [`${header} ${agentInfo.resumeCommand}`];
            term.write(formatResumeBox(lines));
          }
          notifyTerminalSessionRecreated(terminalId);
          // The old session's buffer is on screen, so a ring replay from the
          // *new* session (there is none — it was just created) would be the
          // same double-paint this guards against everywhere else.
          restoredFromBuffer = restored.length > 0;
          replayed = true;
          for (const p of pending) deliver(p.data, p.replay);
          pending.length = 0;
        }

        const saveTimer = window.setInterval(() => {
          if (saveDirty) {
            saveDirty = false;
            persistBuffer();
          }
        }, 2000);
        // Best-effort flush when the window is being hidden/closed (covers an
        // app quit between timer ticks). Gate on saveDirty: a restore writes via
        // term.write (not writeLive), so saveDirty stays false until real output
        // lands. This stops a dev full-reload firing pagehide right after restore
        // — before the shell redraws — from clobbering the good persisted buffer
        // with a not-yet-settled one (cursor stuck at top). When saveDirty is
        // false the last timer tick already holds the current state.
        const onPageHide = () => {
          if (saveDirty) persistBuffer();
        };
        window.addEventListener("pagehide", onPageHide);

        term.attachCustomKeyEventHandler((event) => {
          if (event.type !== "keydown") return true;
          // Cmd+F (Ctrl+F on Windows/Linux) opens the find overlay. This only
          // fires while the terminal textarea has focus, so it never competes
          // with Monaco's own Cmd+F or any global keybinding.
          if (
            (isMac
              ? event.metaKey && !event.ctrlKey
              : event.ctrlKey && !event.metaKey) &&
            !event.altKey &&
            !event.shiftKey &&
            (event.key === "f" || event.key === "F")
          ) {
            event.preventDefault();
            setSearch((s) => ({
              open: true,
              seed: term.getSelection() || s.seed,
              nonce: s.nonce + 1,
            }));
            return false; // don't forward Cmd+F to the PTY
          }
          // Make Shift+Enter send ESC+newline like Alt+Enter does for Claude Code
          if (
            event.key === "Enter" &&
            event.shiftKey &&
            !event.ctrlKey &&
            !event.altKey &&
            !event.metaKey
          ) {
            // Send just ESC and let xterm send the Enter normally
            session.write("\x1b");
            return true; // Let xterm handle the Enter key normally
          }
          return true;
        });
        const exitSub = session.onExit((exitCode) => {
          // Stream EOF ≠ shell death: the session-host often drops the UI data
          // client while the PTY keeps running. Remount/reattach first; only
          // paint "Session ended" after the reconnect budget is spent or attach
          // comes back SESSION_GONE (see planSessionGoneAfterAttach).
          const plan = planExitStreamEnd({
            exitCode,
            reconnectCount: exitReconnectCountRef.current,
          });
          if (plan.action === "exited") {
            logTerminalAttachTrace("ui_reconnect_give_up", {
              terminalId,
              workspaceId: activeWsId,
              sessionId,
              exitCode,
              attempts: exitReconnectCountRef.current,
            });
            pendingExitCodeRef.current = null;
            setLifecycle({ kind: "exited", sessionId, exitCode });
            return;
          }
          exitReconnectCountRef.current = plan.attempt;
          pendingExitCodeRef.current = exitCode;
          logTerminalAttachTrace("ui_reconnect", {
            terminalId,
            workspaceId: activeWsId,
            sessionId,
            exitCode,
            attempt: plan.attempt,
          });
          setLifecycle({ kind: "loading" });
          setVersion((v) => v + 1);
        });
        const onData = term.onData((data) => session.write(data));
        let resizeTimer: number | null = null;
        const onResize = term.onResize(({ cols, rows }) => {
          if (resizeTimer) window.clearTimeout(resizeTimer);
          resizeTimer = window.setTimeout(() => {
            session.resize(cols, rows);
          }, 200);
        });

        disposers.push(
          () => outSub.dispose(),
          () => exitSub.dispose(),
          () => onData.dispose(),
          () => onResize.dispose(),
          () => {
            // Final flush + teardown of the persistence timer/listener. Gated
            // like pagehide so a transient remount can't clobber the buffer.
            window.clearInterval(saveTimer);
            window.removeEventListener("pagehide", onPageHide);
            if (saveDirty) persistBuffer();
          },
          () => {
            if (liveRef.current?.sessionId === sessionId)
              liveRef.current = null;
          },
        );

        // Sustained ready — clear reconnect bookkeeping from a prior false exit.
        pendingExitCodeRef.current = null;
        exitReconnectCountRef.current = 0;
        setLifecycle({ kind: "ready", sessionId });

        // Trigger resize to ensure Claude Code renders properly on both create and restore
        setTimeout(() => {
          if (liveRef.current?.sessionId === sessionId) {
            forceRefit();
          }
        }, 100);

        // RFC 0033: if a profile launch is pending for this terminal, drain it
        // now that the session is live. The view only reports readiness — the
        // host decides what (if anything) to type. `drainPendingLaunch` is
        // remove-on-read, so the background `ensureSession` path racing this
        // one is a no-op for whichever arrives second. This replaces the old
        // `kind`-based shim (the `"claude"`/`"pi"` kinds are deprecated).
        if (needsCreate) {
          drainPendingLaunch(terminalId, sessionId);
        }
      } catch (err) {
        const e = err as Error & { status?: number };
        if (e.status === 404) {
          const gonePlan = planSessionGoneAfterAttach({
            pendingExitCode: pendingExitCodeRef.current,
          });
          if (gonePlan === "exited") {
            // Reconnect after stream EOF found no live host — real session end.
            const exitCode = pendingExitCodeRef.current ?? 0;
            pendingExitCodeRef.current = null;
            logTerminalAttachTrace("ui_attach_gone", {
              terminalId,
              workspaceId: activeWsId,
              sessionId: tRec.sessionId,
              message: e.message,
              reason: "reconnect-host-gone",
            });
            setLifecycle({
              kind: "exited",
              sessionId: tRec.sessionId,
              exitCode,
            });
            return;
          }
          // PTY daemon died (e.g. reboot). Save the old sessionId so the next
          // init() run can replay its persisted buffer after spawning a fresh shell.
          logTerminalAttachTrace("ui_attach_gone", {
            terminalId,
            workspaceId: activeWsId,
            sessionId: tRec.sessionId,
            message: e.message,
          });
          replayFromRef.current = tRec.sessionId;
          // ctx.agents (RFC 0018): mark this terminal's agent activity "dead" —
          // resolves/attaches the resume hint if one wasn't already live-resolved.
          notifyTerminalSessionGone(terminalId);
          logTerminalAttachTrace("ui_recreate", {
            terminalId,
            workspaceId: activeWsId,
            priorSessionId: tRec.sessionId,
            reason: "session-gone",
          });
          recreateTerminal(activeWsId!, terminalId);
          setLifecycle({ kind: "loading" });
          setVersion((v) => v + 1);
        } else {
          logTerminalAttachTrace("ui_attach_fail", {
            terminalId,
            workspaceId: activeWsId,
            sessionId: tRec.sessionId,
            message: e.message ?? "Failed to attach terminal.",
          });
          setLifecycle({
            kind: "stale",
            sessionId: tRec.sessionId,
            message: e.message ?? "Failed to attach terminal.",
          });
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      ro.disconnect();
      unsubFont();
      hideLinkTooltip();

      // Capture session info before disposers clear liveRef
      const sessionId = liveRef.current?.sessionId;
      const session = liveRef.current?.session;

      disposers.forEach((d) => d());
      term.dispose();

      // Kill only when the record was removed (tab close / workspace delete).
      // Soft-close and empty-state unmount leave records in place — including
      // on non-active workspaces — so look across every workspace, not just
      // store.activeWorkspaceId (which is null when the last open workspace
      // soft-closes and CenterDock swaps to the empty state).
      if (
        findTerminalOwnerId(Object.values(store.workspaces), terminalId) ===
          null &&
        sessionId &&
        session
      ) {
        session.kill().catch(() => {});
      }
    };
    // We intentionally exclude sessionId so the initial create+attach
    // does not re-run when we *set* the session id from null to its first value.
    // Recreate flow uses the explicit `version` bump instead.
  }, [terminalId, version]);

  // Derive the dockview tab title. The rules (and why a restored title outranks
  // a running program's name) live in `terminal-title.ts`; this effect is the
  // glue that feeds them live signals and writes the result out.
  // Reacts to PTY writes and also polls as a fallback (hidden panels still
  // render to the buffer but onWriteParsed may not fire if the panel is in a
  // detached group).
  useEffect(() => {
    if (lifecycle.kind !== "ready") return;
    const live = liveRef.current;
    if (!live) return;

    const { term } = live;
    let lastTitle = "";
    // The title this mount inherited from persisted state, held until a live
    // signal supersedes it (see `deriveTitle`). Seeded on the first read(),
    // which is also where the terminal record is first in hand.
    let restoredTitle = "";
    let seeded = false;
    // Most recent title the program pushed via an OSC escape sequence ("" =
    // none yet), stored RAW. Set by onTitleChange; consulted by read() ahead of
    // the tmux scrape but behind any user-assigned customName.
    let oscTitle = "";

    // The OSC title with agent status markers removed (see
    // `stripAgentStatusMarkers`), or verbatim when the user turned the setting
    // off; then, if this tab is actually showing an agent icon right now (per
    // `ctx.terminals.getIcons` — the same registry the tab itself renders
    // from, so this can't drift from what's on screen), also drop that
    // agent's own redundant identity prefix (pi's "π - ", OpenCode's "OC | ")
    // via `stripAgentTitleIdentityPrefix` — the icon already says which agent
    // this is. Read per-call rather than computed once at onTitleChange time
    // so toggling the setting, or the icon setting, takes effect on the next
    // read() tick instead of waiting for the agent to push another title.
    // Returns "" when the title was nothing but a marker, which callers treat
    // as "no title yet".
    const displayOscTitle = () => {
      const glyphsStripped = store.terminalSettings.hideAgentStatusGlyphs
        ? stripAgentStatusMarkers(oscTitle)
        : oscTitle;
      const iconShown = ctx.terminals.getIcons(terminalId).length > 0;
      if (!iconShown) return glyphsStripped;
      const agentId = ctx.agents.getByTerminalId(terminalId)?.agentId;
      return stripAgentTitleIdentityPrefix(agentId, glyphsStripped);
    };
    // Foreground process, from the host (RFC 0010 N1). `fg` stays null until the
    // first update so we fall back to legacy behavior if the signal never
    // arrives. At a prompt, a program's stale OSC title is dropped (N1a); a
    // running program with no OSC title shows its own name (N1b).
    let fg: TerminalForeground | null = null;

    function apply(text: string, rec: TerminalRecord | null) {
      const formatted = formatTitle(text);
      if (formatted === lastTitle) return;
      lastTitle = formatted;
      props.api.setTitle(formatted);
      // Persist to workspace state so the tab title survives reload.
      if (rec) rec.title = formatted;
    }

    /** The tmux status line: quoted text on the last buffer row. */
    function tmuxLine() {
      const buffer = term.buffer.active;
      const bottom = Math.max(0, buffer.length - 1);
      const line = buffer.getLine(bottom);
      return tmuxStatusTitle(line ? line.translateToString(true) : "");
    }

    function read() {
      // Find this terminal's workspace directly so background-workspace terminals
      // (whose wsId ≠ activeWorkspaceId) still have rec.title updated.
      const wsId = Object.keys(store.workspaces).find((id) =>
        store.workspaces[id]?.terminals.some((t) => t.id === terminalId),
      );
      const ws = wsId ? store.workspaces[wsId] : null;
      const rec = ws?.terminals.find((t) => t.id === terminalId) ?? null;

      if (!seeded) {
        seeded = true;
        // What dockview already shows for this tab (it restores panels with the
        // persisted `rec.title`), so `apply` can no-op when nothing changed —
        // and so the reattach rule has something to hold onto.
        lastTitle = rec?.customName ?? rec?.title ?? "";
        restoredTitle = rec?.customName ? "" : (rec?.title ?? "");
      }

      const shown = displayOscTitle();
      const derived = deriveTitle({
        customName: rec?.customName,
        oscTitle: shown,
        fg,
        tmuxLine,
        restoredTitle,
      });
      if (!derived) return;

      // A user-assigned name is shown verbatim (no truncation) and never
      // written to rec.title. We still persist the live OSC title there so
      // extensions can observe actual activity in custom-named terminals.
      if (derived.source === "custom") {
        if (derived.text !== lastTitle) {
          lastTitle = derived.text;
          props.api.setTitle(derived.text);
        }
        if (rec && shown && rec.title !== shown) rec.title = shown;
        return;
      }

      restoredTitle = ""; // superseded by live evidence
      apply(derived.text, rec);
    }

    const offTitle = term.onTitleChange((title) => {
      oscTitle = title.trim();
      read();
    });
    const offWrite = term.onWriteParsed(() => read());
    const updateForeground = (next: TerminalForeground) => {
      fg = next;
      if (next.cwd) {
        cwdRef.current = next.cwd;
        setCwd(next.cwd);
      }
      read();
    };
    const offForeground = onTerminalForeground(
      live.sessionId,
      updateForeground,
    );
    // Seed from the host's cache: `onTerminalForeground` only fires on *change*,
    // and the daemon's one push at attach time can land before this subscriber
    // exists — so a reattached session that then sits idle (an agent waiting for
    // input) would otherwise never report its foreground state at all. A live
    // event that beat the snapshot back wins: it's the newer value.
    let disposed = false;
    void terminalForegroundSnapshot(live.sessionId).then((snapshot) => {
      if (!disposed && snapshot && !fg) updateForeground(snapshot);
    });
    read();
    const interval = window.setInterval(read, 500);

    return () => {
      disposed = true;
      offTitle.dispose();
      offWrite.dispose();
      offForeground();
      window.clearInterval(interval);
    };
  }, [lifecycle.kind, props.api, terminalId]);

  useEffect(() => {
    const dispose = props.api.onDidVisibilityChange(() => {
      if (props.api.isVisible) forceRefit();
    });

    function onRefitSignal() {
      // Two frames: first lets dockview's outer layout settle, second runs
      // when the inner panel size is final.
      requestAnimationFrame(() => requestAnimationFrame(forceRefit));
    }
    window.addEventListener("app:refit-terminals", onRefitSignal);
    return () => {
      dispose.dispose();
      window.removeEventListener("app:refit-terminals", onRefitSignal);
    };
  }, [props.api, forceRefit]);

  // File drops paste the path(s) into the shell. Shift-held (paste mode) or
  // native Finder drops always paste; plain copy-mode internal drops fall
  // through to dockview (opens a new pane). Capture phase intercepts before
  // dockview's bubble-phase drop handler.
  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;
    const reg = ctx.dnd.registerDropTarget(host, {
      accepts: [DND_MIME.filePath],
      capture: true,
      onDrop({ mode, items }) {
        if (mode !== "paste") return; // copy mode → let dockview open a pane
        const paths = items
          .filter((i) => i.mime === DND_MIME.filePath)
          .map((i) => i.value);
        if (!paths.length) return;
        const live = liveRef.current;
        if (!live) return;
        live.term.paste(buildTerminalPaste(paths));
        live.term.focus();
        return true; // handled — host preventDefault + stopPropagation
      },
    });
    return () => reg.dispose();
  }, []);

  function onContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    // Capture before hiding — hideLinkTooltip() clears hoveredLinkRef too.
    const hovered = hoveredLinkRef.current;
    hideLinkTooltip();
    const genericItems: MenuEntry[] = [
      { label: "Copy", accelerator: `${cmdKey}C`, run: ctxCopy },
      { label: "Copy as HTML", run: ctxCopyAsHtml },
      { label: "Paste", accelerator: `${cmdKey}V`, run: ctxPaste },
      { label: "Select All", accelerator: `${cmdKey}A`, run: ctxSelectAll },
      { type: "separator" },
      {
        label: "Clear",
        accelerator: menuAcceleratorForCommand("core.terminal.clear"),
        run: ctxClear,
      },
      { label: "New Terminal Here", run: ctxNewTerminalHere },
      ...agentsSubmenuEntries(),
      { type: "separator" },
      { label: "Kill Terminal", danger: true, run: ctxKill },
    ];

    // Right-clicking directly on a link always selects it and shows link
    // actions (ADR 0027) — this takes priority over pasteOnRightClick, since
    // landing on a specific, unambiguous target is a stronger signal of
    // intent than the blanket "paste on right-click" setting.
    if (hovered) {
      const live = liveRef.current;
      if (live) {
        live.term.select(
          hovered.range.start.x - 1,
          hovered.range.start.y - 1,
          hovered.text.length,
        );
      }
      const labels = linkMenuLabels(hovered.kind);
      const items: MenuEntry[] = [
        {
          label: labels.open,
          run: () => {
            if (hovered.kind === "url") openTerminalLink(ctx, hovered.text);
            else
              void openFileFromTerminal(hovered.text, terminalId, ctx.editors);
          },
        },
        {
          label: labels.copy,
          run: () => void navigator.clipboard.writeText(hovered.text),
        },
      ];
      // Extension contributions on the "terminal/link" surface (RFC 0013),
      // grouped and separated below the built-in link actions.
      const contributed = contextMenuEntriesFor("terminal/link", {
        terminalId,
        kind: hovered.kind,
        text: hovered.text,
      });
      if (contributed.length > 0) {
        items.push({ type: "separator" }, ...contributed);
      }
      items.push({ type: "separator" }, ...genericItems);
      void ctx.ui.showMenu({ items, at: { x: e.clientX, y: e.clientY } });
      return;
    }

    // When enabled, right-click pastes instead of opening the context menu. The
    // paste itself happens in the `auxclick` handler (a real click gesture).
    if (store.terminalSettings.pasteOnRightClick) {
      return;
    }
    void ctx.ui.showMenu({
      items: genericItems,
      at: { x: e.clientX, y: e.clientY },
    });
  }

  async function ctxCopy() {
    const live = liveRef.current;
    if (!live) return;
    const text = live.term.getSelection();
    if (text) await navigator.clipboard.writeText(text);
    live.term.focus();
  }

  async function ctxCopyAsHtml() {
    const live = liveRef.current;
    if (!live) return;
    // getSelectionAsHtml is a proposed API — available when allowProposedApi: true
    const html =
      (
        live.term as unknown as { getSelectionAsHtml?: () => string }
      ).getSelectionAsHtml?.() ?? "";
    if (html)
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
        }),
      ]);
    live.term.focus();
  }

  async function ctxPaste() {
    const live = liveRef.current;
    if (!live) return;
    live.term.focus();
    try {
      const text = await readClipboardText();
      if (text) live.term.paste(text);
    } catch (err) {
      console.warn("[terminal] paste failed", err);
    }
  }

  function ctxSelectAll() {
    const live = liveRef.current;
    if (!live) return;
    live.term.selectAll();
    live.term.focus();
  }

  function ctxClear() {
    const live = liveRef.current;
    if (!live) return;
    live.term.clear();
    live.persistNow?.();
    live.term.focus();
  }

  useEffect(() => {
    if (lifecycle.kind !== "ready") return;
    return registerTerminalClear(terminalId, ctxClear).dispose;
  }, [lifecycle.kind, terminalId]);

  function ctxKill() {
    const live = liveRef.current;
    if (!live) return;
    live.session.kill().catch(() => {});
  }

  // Open a new terminal in this terminal's current directory (RFC 0010 N2). Uses
  // the live foreground cwd; falls back to the default (workspace folder) if the
  // host hasn't reported one yet.
  function ctxNewTerminalHere() {
    ctx.terminals.create({ cwd: cwdRef.current || undefined });
  }

  // RFC 0033: an "Agents" submenu mirroring the `+` menu's profile list, but
  // launching the profile **in this terminal** — type its launch line into the
  // live shell, exactly as if the user had typed it. This terminal keeps no
  // `profileId` (that back-reference is only set when Silo owns the launch); the
  // agent is picked up by detection like any hand-typed one. Omitted entirely
  // with no profiles — the context menu is not an onboarding surface.
  function agentsSubmenuEntries(): MenuEntry[] {
    const profiles = getAgentProfiles();
    if (profiles.length === 0) return [];
    const catalog = ctx.agents.catalog();
    const colorScheme = getThemeBase(store.activeThemeId);
    return [
      {
        label: "Agents",
        submenu: profiles.map(
          (p): MenuEntry => ({
            label: p.label,
            icon: (
              <span className="term-menu-agent-icon">
                <AgentIconGlyph
                  icon={catalog.find((a) => a.id === p.assumedAgentId)?.icon}
                  mode="color"
                  colorScheme={colorScheme}
                />
              </span>
            ),
            run: () => runProfileHere(p.id),
          }),
        ),
      },
    ];
  }

  function runProfileHere(profileId: string) {
    const live = liveRef.current;
    if (!live) return;
    const profile = getAgentProfiles().find((p) => p.id === profileId);
    if (!profile) return; // deleted between menu open and click
    live.session.write(`${profileLaunchLine(profile)}\r`);
    live.term.focus();
  }

  // A freshly-created terminal (Cmd+T / "New Terminal") is set active by the
  // dock the instant it mounts — before its xterm/PTY has spawned. The
  // activation focus below fires then, finds `term` still null, and gives up
  // within its frame budget, so focus is left on nothing. Re-assert focus once
  // the terminal is ready, if its tab is still the active one.
  useEffect(() => {
    if (lifecycle.kind !== "ready" || !props.api.isActive) return;
    retryFocus(
      () => liveRef.current?.term.focus(),
      () => {
        const ta = liveRef.current?.term.textarea;
        return ta != null && document.activeElement === ta;
      },
      () => props.api.isActive,
    );
  }, [lifecycle.kind, props.api]);

  // xterm has no `hasTextFocus()`, but it exposes its helper textarea — focus
  // has landed once that element is the document's active element.
  useFocusOnActive(
    props.api,
    () => liveRef.current?.term.focus(),
    () => {
      const ta = liveRef.current?.term.textarea;
      return ta != null && document.activeElement === ta;
    },
    () => {
      const ta = liveRef.current?.term.textarea;
      if (!ta) return;
      if (document.activeElement === ta) {
        ta.blur();
      } else {
        // Focus already moved on and the real blur was dropped — resync xterm's
        // tracker without disturbing where DOM focus is.
        ta.dispatchEvent(new FocusEvent("blur"));
        ta.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      }
    },
  );

  // The terminal's workspace folder (this terminal may live in a backgrounded
  // workspace, so resolve by membership rather than assuming the active one).
  let wsFolder: string | undefined;
  for (const id of Object.keys(store.workspaces)) {
    if (store.workspaces[id].terminals.some((t) => t.id === terminalId)) {
      wsFolder = store.workspaces[id].folder;
      break;
    }
  }

  return (
    <div className="terminal-panel" onContextMenu={onContextMenu}>
      {showBreadcrumb && (
        <div className="terminal-toolbar">
          <Breadcrumb
            filePath={cwd || wsFolder || null}
            workspaceFolder={wsFolder}
            leafIcon="folder"
          />
          <ContributedToolbar
            surface="terminal"
            target={{ terminalId }}
            showMenu={ctx.ui.showMenu}
          />
        </div>
      )}
      <div className="terminal-panel__body">
        <div
          ref={containerRef}
          className={`terminal-host${lifecycle.kind === "ready" ? " terminal-host--active" : ""}`}
        />
        {search.open && lifecycle.kind === "ready" && liveRef.current && (
          <TerminalSearch
            key={search.nonce}
            addon={liveRef.current.search}
            host={containerRef.current}
            initialQuery={search.seed}
            onClose={() => setSearch((s) => ({ ...s, open: false }))}
            onFocusTerminal={() => liveRef.current?.term.focus()}
          />
        )}
        {lifecycle.kind === "stale" && (
          <div className="terminal-overlay interactive">
            <div>{lifecycle.message}</div>
            <button onClick={recreate}>Recreate terminal</button>
          </div>
        )}
        {lifecycle.kind === "exited" && (
          <div className="terminal-overlay">
            <div>Process exited (code {lifecycle.exitCode}).</div>
            <div className="hint">
              Session ended. Close this tab and open a new terminal to start
              fresh.
            </div>
          </div>
        )}
      </div>
      {linkTooltip &&
        // .silo-tooltip is the host's shared tooltip style (see
        // packages/extension-host/src/components/Tooltip.css), loaded
        // globally since other core extensions (e.g. the status bar) use the
        // Tooltip component. Positioned by hand here since xterm renders
        // links to canvas — there's no DOM element to anchor a wrapping
        // Tooltip to.
        createPortal(
          <div
            className="silo-tooltip"
            style={{ left: linkTooltip.x + 12, top: linkTooltip.y + 16 }}
          >
            {linkTooltip.text}
          </div>,
          document.body,
        )}
    </div>
  );
}
