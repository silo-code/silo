// Standalone terminals: process kept alive across restarts by the self-owned
// PTY host (RFC 0010); screen + scrollback persisted/restored via the xterm.js
// SerializeAddon (VS Code-style "process revive").
import { useCallback, useEffect, useRef, useState } from "react";
import { subscribe, useSnapshot } from "valtio";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { SerializeAddon } from "@xterm/addon-serialize";
import { SearchAddon } from "@xterm/addon-search";
import type { IDockviewPanelProps } from "dockview";
import {
  DND_MIME,
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
  getThemeBase,
  retryFocus,
  useFocusOnActive,
  onTerminalForeground,
  registerSelectionSource,
} from "@silo-code/extension-host/internal";
import { xtermThemeFor } from "./xterm-theme";
import { effectiveFontFamily } from "./terminal-font";
import { buildTerminalPaste } from "./terminal-path-paste";
import { findFileLinks, getHomeDir } from "./terminal-links";
import { TerminalSearch } from "./TerminalSearch";
import { Breadcrumb } from "../editor/Breadcrumb";
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

interface Params {
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
}

async function openFileFromTerminal(
  matched: string,
  terminalId: string,
  editors: EditorService,
): Promise<void> {
  // Find the workspace that owns this terminal (don't assume the active one).
  const wsId = Object.keys(store.workspaces).find((id) =>
    store.workspaces[id].terminals.some((t) => t.id === terminalId),
  );
  if (!wsId) return;
  const ws = store.workspaces[wsId];

  // Pull off the optional :LINE:COL suffix. We don't currently honor it
  // (editor doesn't expose a goto-line API), but stripping it ensures the
  // path resolves to a real file.
  const lineColMatch = matched.match(/^(.+?)(?::(\d+))?(?::(\d+))?$/);
  let path = lineColMatch?.[1] ?? matched;

  if (path.startsWith("~/")) {
    const home = await getHomeDir();
    path = `${home}/${path.slice(2)}`;
  } else if (!path.startsWith("/")) {
    const rel = path.replace(/^\.\//, "");
    path = `${ws.folder.replace(/\/$/, "")}/${rel}`;
  }

  editors.open(path, { workspaceId: wsId });
}

export function TerminalPanel(
  props: IDockviewPanelProps<Params> & { ctx: ExtensionContext },
) {
  const { terminalId } = props.params;
  const { ctx } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const liveRef = useRef<LiveRefs | null>(null);
  // Active disposer for this terminal's selection source (registered while focused).
  const selSourceRef = useRef<Disposable | null>(null);
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
      scrollSensitivity: 3,
      fastScrollSensitivity: 5,
      // xterm hand-draws box-drawing/block glyphs (U+2500 etc.) with vector
      // paths instead of the font. Its WebGL renderer mis-draws some of those
      // cells as artifacts (e.g. blobs on pi's ──── separators), so render box
      // glyphs from the font instead. Regular text is unaffected.
      customGlyphs: false,
      allowProposedApi: true,
      bellStyle: "none",
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
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
          findFileLinks(term, bufferLineNumber, (text) =>
            openFileFromTerminal(text, terminalId, ctx.editors),
          ),
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

    // Paste on right-click: do it from `auxclick` (a real click gesture WebKit
    // allows clipboard reads from) rather than `contextmenu` (which it doesn't).
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
        const session = needsCreate
          ? await ctx.process.spawn({
              cwd: tRec.cwd ?? ws.folder,
              cols,
              rows,
            })
          : await ctx.process.attach(tRec.sessionId, { cols, rows });
        const sessionId = session.id;

        if (cancelled) {
          return;
        }
        if (needsCreate) tRec.sessionId = sessionId;

        liveRef.current = {
          term,
          fit,
          search: searchAddon,
          session,
          sessionId,
        };

        // Publish the terminal's selection to the active-selection registry
        // while it has focus, so `ctx.ui.getActiveSelectionText()` (e.g. the
        // Search panel's Cmd+Shift+F) can read it. Cleared on blur / teardown.
        const onTermFocus = () => {
          selSourceRef.current?.dispose();
          selSourceRef.current = registerSelectionSource(
            () => liveRef.current?.term.getSelection() || null,
          );
        };
        const onTermBlur = () => {
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
            const data = serializeAddon.serialize({ scrollback: 2000 });
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
        const pendingLive: string[] = [];
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
        const outSub = session.onData((data) => {
          if (!replayed) {
            pendingLive.push(data);
            return;
          }
          writeLive(data);
        });

        // Restore the previous buffer on attach, then release buffered live output.
        if (!needsCreate) {
          const restored = await session.getBuffer();
          if (restored.length > 0) {
            term.write(restored);
          }
          replayed = true;
          for (const d of pendingLive) writeLive(d);
          pendingLive.length = 0;
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
          replayed = true;
          for (const d of pendingLive) writeLive(d);
          pendingLive.length = 0;
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
          setLifecycle({ kind: "exited", sessionId, exitCode });
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

        setLifecycle({ kind: "ready", sessionId });

        // Trigger resize to ensure Claude Code renders properly on both create and restore
        setTimeout(() => {
          if (liveRef.current?.sessionId === sessionId) {
            forceRefit();
          }
        }, 100);

        if (needsCreate && tRec.kind !== "shell") {
          const cmd = tRec.kind === "claude" ? "claude" : "pi";
          window.setTimeout(() => session.write(`${cmd}\r`), 150);
        }
      } catch (err) {
        const e = err as Error & { status?: number };
        if (e.status === 404) {
          // PTY daemon died (e.g. reboot). Save the old sessionId so the next
          // init() run can replay its persisted buffer after spawning a fresh shell.
          replayFromRef.current = tRec.sessionId;
          recreateTerminal(activeWsId!, terminalId);
          setLifecycle({ kind: "loading" });
          setVersion((v) => v + 1);
        } else {
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

      // Capture session info before disposers clear liveRef
      const sessionId = liveRef.current?.sessionId;
      const session = liveRef.current?.session;

      disposers.forEach((d) => d());
      term.dispose();

      // Clean up session only if the terminal record was deleted
      const wsId = store.activeWorkspaceId;
      const recordStillExists =
        wsId &&
        store.workspaces[wsId]?.terminals.some((t) => t.id === terminalId);
      if (!recordStillExists && sessionId && session) {
        session.kill().catch(() => {});
      }
    };
    // We intentionally exclude sessionId so the initial create+attach
    // does not re-run when we *set* the session id from null to its first value.
    // Recreate flow uses the explicit `version` bump instead.
  }, [terminalId, version]);

  // Derive the dockview tab title, in priority order:
  //   1. a user-assigned name (right-click → Rename) — always wins;
  //   2. a title the program pushed via an OSC 0/1/2 escape sequence (e.g.
  //      Claude Code updating its title as its activity changes) — xterm
  //      surfaces these through onTitleChange;
  //   3. the tmux status line (last visible row) as a fallback for programs
  //      that don't emit an OSC title.
  // Reacts to PTY writes and also polls as a fallback (hidden panels still
  // render to the buffer but onWriteParsed may not fire if the panel is in a
  // detached group).
  useEffect(() => {
    if (lifecycle.kind !== "ready") return;
    const live = liveRef.current;
    if (!live) return;

    const { term } = live;
    let lastTitle = "";
    // Most recent title the program pushed via an OSC escape sequence ("" =
    // none yet). Set by onTitleChange; consulted by read() ahead of the tmux
    // scrape but behind any user-assigned customName.
    let oscTitle = "";
    // Foreground process, from the host (RFC 0010 N1). `fgKnown` stays false
    // until the first update so we fall back to legacy behavior if the signal
    // never arrives. At a prompt, a program's stale OSC title is dropped (N1a);
    // a running program with no OSC title shows its own name (N1b).
    let fgKnown = false;
    let fgAtPrompt = true;
    let fgLeader = "";
    const progName = (s: string) =>
      (s.replace(/^-/, "").split("/").pop() ?? s).trim();

    function apply(text: string, rec: TerminalRecord | null) {
      if (!text) text = "Terminal";
      else if (text.length > 32) text = text.slice(0, 31) + "…";
      if (text === lastTitle) return;
      lastTitle = text;
      props.api.setTitle(text);
      // Persist to workspace state so the tab title survives reload.
      if (rec) rec.title = text;
    }

    function read() {
      // Find this terminal's workspace directly so background-workspace terminals
      // (whose wsId ≠ activeWorkspaceId) still have rec.title updated.
      const wsId = Object.keys(store.workspaces).find((id) =>
        store.workspaces[id]?.terminals.some((t) => t.id === terminalId),
      );
      const ws = wsId ? store.workspaces[wsId] : null;
      const rec = ws?.terminals.find((t) => t.id === terminalId) ?? null;

      // 1. A user-assigned name wins over any auto-derived title for the tab
      // display. We still persist the live OSC title to rec.title so extensions
      // can observe actual activity in custom-named terminals.
      if (rec?.customName) {
        if (rec.customName !== lastTitle) {
          lastTitle = rec.customName;
          props.api.setTitle(rec.customName);
        }
        if (oscTitle && rec.title !== oscTitle) rec.title = oscTitle;
        return;
      }

      const knownPrompt = fgKnown && fgAtPrompt; // host says: at a prompt
      const knownRunning = fgKnown && !fgAtPrompt; // host says: program running

      // 2. A title the program set via an OSC escape sequence (e.g. Claude Code).
      //    Drop it once we KNOW we're back at a prompt (N1a — stale title fix);
      //    otherwise trust it.
      if (oscTitle && !knownPrompt) {
        apply(oscTitle, rec);
        return;
      }

      // 3. A running program with no OSC title of its own → show its name (N1b).
      if (knownRunning && fgLeader) {
        apply(progName(fgLeader), rec);
        return;
      }

      // 4. The tmux status line (quoted text on the last row).
      const buffer = term.buffer.active;
      const bottom = Math.max(0, buffer.length - 1);
      const line = buffer.getLine(bottom);
      const raw = line ? line.translateToString(true) : "";
      const match = raw.match(/"([^"]*)"/);
      if (match) {
        apply(match[1].trim(), rec);
        return;
      }

      // 5. Back at a prompt with nothing better → the shell name (the visible
      //    half of N1a: replace the stale program title). Otherwise leave as-is.
      if (knownPrompt && fgLeader) {
        apply(progName(fgLeader), rec);
      }
    }

    const offTitle = term.onTitleChange((title) => {
      oscTitle = title.trim();
      read();
    });
    const offWrite = term.onWriteParsed(() => read());
    const offForeground = onTerminalForeground(live.sessionId, (fg) => {
      fgKnown = true;
      fgAtPrompt = fg.atPrompt;
      fgLeader = fg.leader;
      if (fg.cwd) {
        cwdRef.current = fg.cwd;
        setCwd(fg.cwd);
      }
      read();
    });
    read();
    const interval = window.setInterval(read, 500);

    return () => {
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
    // When enabled, right-click pastes instead of opening the context menu. The
    // paste itself happens in the `auxclick` handler — WebKit grants clipboard
    // read only on a real click gesture, not on a `contextmenu` event.
    if (store.terminalSettings.pasteOnRightClick) {
      return;
    }
    const items: MenuEntry[] = [
      { label: "Copy", accelerator: `${cmdKey}C`, run: ctxCopy },
      { label: "Copy as HTML", run: ctxCopyAsHtml },
      { label: "Paste", accelerator: `${cmdKey}V`, run: ctxPaste },
      { label: "Select All", accelerator: `${cmdKey}A`, run: ctxSelectAll },
      { type: "separator" },
      { label: "Clear", accelerator: `${cmdKey}K`, run: ctxClear },
      { label: "New Terminal Here", run: ctxNewTerminalHere },
      { type: "separator" },
      { label: "Kill Terminal", danger: true, run: ctxKill },
    ];
    void ctx.ui.showMenu({ items, at: { x: e.clientX, y: e.clientY } });
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
    // Focus first so the webview clipboard read has document focus (the
    // right-click path otherwise reads with the window unfocused).
    live.term.focus();
    try {
      const text = await navigator.clipboard.readText();
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
    live.term.focus();
  }

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
        <Breadcrumb
          filePath={cwd || wsFolder || null}
          workspaceFolder={wsFolder}
          leafIcon="folder"
        />
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
    </div>
  );
}
