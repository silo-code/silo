// Typed client for the dev-only automation RPC (see `docs/automation.md` and the
// webview half in `./bridge.ts`). This is the driver layer for integration
// tests and external scripts — it turns the raw `POST / {op,args}` protocol into
// typed methods so tests read like ordinary code instead of hand-written curl.
//
// It runs in Node (Vitest's `integration` project) or any fetch-capable host,
// and talks to a running dev app (`npm run app:dev`) over loopback. Every
// request carries the `X-Silo-Automation` header the server's guard requires.
// It imports nothing from the app, so it never ships in a bundle.

const DEFAULT_PORT = process.env.SILO_AUTOMATION_PORT ?? "7878";
const DEFAULT_BASE = `http://127.0.0.1:${DEFAULT_PORT}`;

/** One live editor's focus ground-truth, from the `editorsDetail` op. */
export interface EditorDetail {
  modelUri: string | null;
  hasTextFocus: boolean;
  /** This editor's own `.inputarea` is the live `document.activeElement`. */
  textareaIsActiveElement: boolean;
  /** The editor's container is laid out with non-zero size and visible. */
  containerVisible: boolean;
}

export interface WorkspaceList {
  active: string | null;
  workspaces: {
    id: string;
    name?: string;
    folder?: string;
    /** ISO timestamp when soft-closed, or null when open. */
    closedAt?: string | null;
  }[];
}

/** Resolved Monaco editor configuration, from the `editorOptions` op. */
export interface EditorOptions {
  uri: string | null;
  /** Monaco language id (e.g. `typescript`, `markdown`, `plaintext`). */
  language: string | null;
  /** Resolved rendered font size in px (text mode = uiFontSize + 0.5). */
  fontSize: number;
  tabSize: number | null;
  insertSpaces: boolean | null;
  /** `"on"` / `"off"` / `"wordWrapColumn"` / `"bounded"` (Monaco enum). */
  wordWrap: string;
  minimap: boolean;
  renderWhitespace: string;
  renderLineHighlight: string;
  readOnly: boolean;
}

/** What currently holds DOM focus, from the `activeElement` op. */
export interface ActiveElement {
  tag: string;
  className: string;
  id: string;
  isTextarea: boolean;
  inMonaco: boolean;
  inXterm: boolean;
  /**
   * False both when focus is on a backgrounded workspace's (hidden) dock
   * content AND when focus isn't inside any dock at all — those are very
   * different outcomes. Use {@link ActiveElement.inBackgroundDockHost} to
   * tell them apart rather than asserting on this field alone.
   */
  inActiveDockHost: boolean;
  /** True specifically when focus landed inside a backgrounded dock-host. */
  inBackgroundDockHost: boolean;
}

/** A single serialisable log entry from the `outputLogs` op. */
export interface OutputLogEntry {
  timestamp: string; // ISO 8601
  level: string;
  message: string;
  data?: unknown;
}

/** Result of the `outputLogs` op. */
export interface OutputLogsResult {
  channel: string;
  displayName: string;
  totalCount: number;
  entries: OutputLogEntry[];
  channels: { key: string; displayName: string }[];
}

/** A theme's identity, as returned by the `themeState` op. */
export interface ThemeRef {
  id: string;
  name: string;
  base: "dark" | "light";
}

/** Theme-domain state from the `themeState` op (drives theme regression tests). */
export interface ThemeState {
  activeId: string;
  /** Core Dark/Light + every registered preset, in registration order. */
  presets: ThemeRef[];
  customThemes: ThemeRef[];
}

/** A typed wrapper around the automation RPC. One instance per app under test. */
export class SiloAutomation {
  constructor(private readonly base: string = DEFAULT_BASE) {}

  private async call<T>(
    op: string,
    args?: Record<string, unknown>,
  ): Promise<T> {
    const res = await fetch(this.base, {
      method: "POST",
      // Required by the server's request guard — a browser can't set a custom
      // header cross-origin without a preflight the server never answers.
      headers: { "X-Silo-Automation": "1" },
      body: JSON.stringify({ op, args }),
    });
    const json = (await res.json()) as
      | { ok: true; result: T }
      | { ok: false; error: string };
    if (!json.ok)
      throw new Error(`automation op "${op}" failed: ${json.error}`);
    return json.result;
  }

  /** Liveness probe; answered host-side without a webview round-trip. */
  ping(): Promise<string> {
    return this.call<string>("ping");
  }

  /** True if the dev app's RPC is reachable — gate integration suites. */
  async available(): Promise<boolean> {
    try {
      return (await this.ping()) === "pong";
    } catch {
      return false;
    }
  }

  /**
   * True if the app window is visible AND holds OS focus right now. Focus-
   * sensitive suites (which assert a `<textarea>` is the real
   * `document.activeElement`) can only pass while the window is frontmost — and
   * the window can't be kept frontmost from a headless/agent/CI session (it
   * backgrounds the moment focus shifts to the test runner). Gate those suites
   * on this so they SKIP (not falsely FAIL) when run without a foregrounded
   * window; a human keeping the window frontmost still exercises them. See
   * docs/architecture-audit/characterization-baseline.md → "Focus suite".
   */
  async foreground(): Promise<boolean> {
    try {
      return (
        (await this.eval<boolean>(
          'document.visibilityState === "visible" && document.hasFocus()',
        )) === true
      );
    } catch {
      return false;
    }
  }

  listWorkspaces(): Promise<WorkspaceList> {
    return this.call("listWorkspaces");
  }

  openWorkspace(folder: string, name?: string): Promise<{ id: string }> {
    return this.call("openWorkspace", { folder, name });
  }

  activateWorkspace(id: string): Promise<{ active: string | null }> {
    return this.call("activateWorkspace", { id });
  }

  /**
   * Soft-close a workspace — keeps the entry (and its terminals / PTYs) so it
   * can be reopened. Counterpart to {@link SiloAutomation.deleteWorkspace}.
   */
  closeWorkspace(
    id: string,
  ): Promise<{ closed: boolean; active: string | null }> {
    return this.call("closeWorkspace", { id });
  }

  /** Fully remove a workspace entry (and reap its PTYs). For teardown. */
  deleteWorkspace(
    id: string,
  ): Promise<{ deleted: boolean; active: string | null }> {
    return this.call("deleteWorkspace", { id });
  }

  /**
   * Whether a PTY session is still alive in the pty-host daemon. Uses
   * `ctx.process.attach` as a probe — does not kill the session.
   */
  processAlive(sessionId: string): Promise<{ alive: boolean; error?: string }> {
    return this.call("processAlive", { sessionId });
  }

  /** Terminal tab records for a workspace (defaults to the active one). */
  listTerminals(workspaceId?: string): Promise<{
    terminals: {
      id: string;
      title: string;
      sessionId: string;
      kind: string;
    }[];
  }> {
    return this.call("listTerminals", { workspaceId });
  }

  openFile(path: string): Promise<{ editorId: string; panelId: string }> {
    return this.call("openFile", { path });
  }

  /**
   * The editor tab model for a workspace — text editors and diffs alike (a diff
   * is a record with `mode: "diff"`), plus the preview-tab lifecycle fields. Use
   * to assert preview/promotion behavior. Defaults to the active workspace.
   */
  listEditors(workspaceId?: string): Promise<{
    previewEditorId: string | null;
    editors: {
      id: string;
      filePath: string | null;
      title: string;
      isPreview: boolean;
      mode: "text" | "diff";
      providerId: string | null;
    }[];
  }> {
    return this.call("listEditors", { workspaceId });
  }

  /**
   * Open a diff via a registered content provider. Generic by design — the
   * caller names the `providerId` (e.g. `"silo.git"`) and its `args` (e.g.
   * `{ mode }`); the bridge stays decoupled from any specific extension. Pass
   * `preview: true` to open it as a temporary/preview tab (single-click style).
   * `diffId` is the editor record id; the diff's Monaco model URIs are
   * `${diffId}/original` and `${diffId}/modified`.
   */
  openDiff(spec: {
    path: string;
    providerId: string;
    args?: Record<string, unknown>;
    title?: string;
    preview?: boolean;
  }): Promise<{ diffId: string; panelId: string }> {
    return this.call("openDiff", spec);
  }

  /**
   * `workspaceId` defaults to the active workspace; pass another one to add a
   * terminal to a *backgrounded* workspace (e.g. simulating an agent spawning
   * a terminal in a workspace the user isn't looking at).
   */
  openTerminal(
    cwd?: string,
    workspaceId?: string,
  ): Promise<{ terminalId: string; panelId: string }> {
    return this.call("openTerminal", { cwd, workspaceId });
  }

  /**
   * Write to a terminal's PTY as if typed. Force-spawns the session when the
   * tab has never mounted — useful for tests that need a live `sessionId`
   * without waiting on dock mount/focus.
   */
  sendText(
    terminalId: string,
    text: string,
    addNewline = true,
  ): Promise<{ sent: boolean }> {
    return this.call("sendText", { terminalId, text, addNewline });
  }

  /** Run a registered command id — the same dispatch menus/keybindings use. */
  exec(command: string): Promise<{ ran: boolean }> {
    return this.call("exec", { command });
  }

  /**
   * Run a one-shot subprocess through the real `ctx.process.exec` service.
   * Resolves with captured output even on a non-zero exit (inspect `code`).
   */
  processExec(
    command: string,
    args: string[],
    cwd?: string,
  ): Promise<{ stdout: string; stderr: string; code: number }> {
    return this.call("processExec", { command, args, cwd });
  }

  /** What currently holds DOM focus (or null). */
  activeElement(): Promise<ActiveElement | null> {
    return this.call("activeElement");
  }

  /** Read theme-domain state — the active id + merged preset/custom lists. */
  themeState(): Promise<ThemeState> {
    return this.call("themeState");
  }

  /** Switch the active theme by id (via ctx.theme.setActive). */
  setTheme(id: string): Promise<{ activeId: string }> {
    return this.call("setTheme", { id });
  }

  /**
   * Capture the app window to a PNG (base64). Answered host-side (the webview
   * can't rasterize itself). macOS needs Screen Recording permission for the
   * app the first time. Decode `png_base64` to view/diff the rendered UI.
   */
  screenshot(): Promise<{
    png_base64: string;
    width: number;
    height: number;
    app: string;
    title: string;
  }> {
    return this.call("screenshot");
  }

  activatePanel(panelId: string): Promise<{ activated: string }> {
    return this.call("activatePanel", { panelId });
  }

  /**
   * Drive `ctx.terminals.focus(terminalId)` — the public API an extension's side
   * panel calls. Unlike {@link activatePanel} this covers the cross-workspace
   * jump (switch to the terminal's workspace, then land on its tab).
   */
  focusTerminal(terminalId: string): Promise<{ focused: string }> {
    return this.call("focusTerminal", { terminalId });
  }

  /**
   * Reproduce an extension calling `ctx.workspaces.activate(workspaceId)`
   * immediately followed by `ctx.terminals.focus(terminalId)` — the ordering
   * agent-inspector's Navigator row click (and, per RFC 0023, the real
   * agent-monitor extension) uses. This is the shape that drops the
   * cross-workspace activation request when the two calls race with
   * `WorkspaceDock`'s own dock-mount commit. See ADR 0034.
   */
  activateThenFocusTerminal(
    workspaceId: string,
    terminalId: string,
  ): Promise<{ focused: string }> {
    return this.call("activateThenFocusTerminal", { workspaceId, terminalId });
  }

  /**
   * The panel id the visible center dock is showing, straight from dockview —
   * the ground truth for "which tab am I on", and for watching whether it stays
   * put.
   */
  activePanel(): Promise<{ panelId: string | null }> {
    return this.call("activePanel");
  }

  /**
   * Simulate the window regaining OS focus by calling the same
   * `restoreRegionFocus()` Tauri's real `onFocusChanged` handler calls.
   * Returns what focus landed on afterward plus which panel the active dock
   * now shows, so a test can catch it dragging the active tab along with it.
   */
  restoreRegionFocus(): Promise<
    (ActiveElement & { activePanelId: string | null }) | null
  > {
    return this.call("restoreRegionFocus");
  }

  /**
   * Move the active center panel into a new split group (test driver), so a test
   * can build a multi-group center — e.g. open an editor + a terminal, then split
   * so they sit in two groups side by side. Returns the resulting group count.
   */
  splitActivePanel(
    position: "left" | "right" | "top" | "bottom" = "right",
  ): Promise<{ groups: number }> {
    return this.call("splitActivePanel", { position });
  }

  /**
   * Bring a registered side panel into view by id (selects its tab + expands
   * its slot). Side panels are lazy-mounted, so call this before asserting on a
   * panel that isn't already showing — e.g. `showSidePanel("git-explorer")`.
   */
  showSidePanel(
    id: string,
  ): Promise<{ shown: boolean; slot?: "left" | "right"; error?: string }> {
    return this.call("showSidePanel", { id });
  }

  /** Per-editor focus ground-truth — the signal focus/routing tests assert on. */
  editorsDetail(): Promise<EditorDetail[]> {
    return this.call("editorsDetail");
  }

  clearFocusLog(): Promise<{ cleared: true }> {
    return this.call("focusLog", { clear: true });
  }

  /**
   * Read a live Monaco model's content, matched by URI substring (e.g. a file
   * name). Returns null if no model matches. Ground truth for "did the open
   * editor reload after the file changed on disk?".
   */
  editorContent(uri: string): Promise<{ uri: string; value: string } | null> {
    return this.call("editorContent", { uri });
  }

  /**
   * Resolved Monaco configuration for the editor whose model URI contains
   * `uri` — the source of truth for which settings actually reached the editor.
   * Used to pin the text-vs-diff option divergence and to prove the core.editor
   * consolidation converges both modes. Returns null if no editor matches.
   */
  editorOptions(uri: string): Promise<EditorOptions | null> {
    return this.call("editorOptions", { uri });
  }

  /**
   * Replace the content of the editor whose model URI contains `uri` via
   * `model.setValue` — fires the same change path as typing (onChange → dirty →
   * save) without needing OS keyboard focus on the window. Returns null if no
   * model matched.
   */
  setEditorValue(
    uri: string,
    value: string,
  ): Promise<{ uri: string; valueLength: number } | null> {
    return this.call("setEditorValue", { uri, value });
  }

  /**
   * Read entries from an output channel, with optional filters.
   * Defaults to the first registered channel and the 200 most-recent entries.
   * Pass `channel` (e.g. `"silo:notifications"`, `"silo:application"`) to
   * target a specific channel. Use `level` and `search` to narrow down.
   */
  outputLogs(opts?: {
    channel?: string;
    level?: "debug" | "info" | "warn" | "error" | "all";
    search?: string;
    limit?: number;
  }): Promise<OutputLogsResult> {
    return this.call("outputLogs", opts ?? {});
  }

  /**
   * Evaluate an expression in the running webview and return its value (awaited
   * if it's a promise). The general-purpose escape hatch for asserting on DOM /
   * app state a dedicated op doesn't cover yet — dev-only, like the rest.
   */
  eval<T = unknown>(expr: string): Promise<T> {
    return this.call("eval", { expr });
  }

  /**
   * Dispatch a synthetic `keydown` for `key` at the current
   * `document.activeElement` (or the element matched by `opts.selector`) and
   * return what holds focus afterward. Drives the keyboard-nav handlers that act
   * on a keydown directly — the workspaces list's roving Arrow/Home/End/Enter,
   * the ContextMenu key, the menu's document-level navigation, and the side-dock
   * Tab handoff. NOTE: a synthetic key event does **not** trigger the browser's
   * native Tab focus movement; only handlers that respond to the event itself
   * (and `preventDefault` it, like the Tab handoff) react — so a plain Tab that
   * relies on default focus order won't move focus here.
   */
  async key(
    key: string,
    opts: {
      shiftKey?: boolean;
      metaKey?: boolean;
      ctrlKey?: boolean;
      altKey?: boolean;
      /** Dispatch at this element instead of `document.activeElement`. */
      selector?: string;
    } = {},
  ): Promise<ActiveElement | null> {
    const { selector, ...mods } = opts;
    const init = JSON.stringify({
      key,
      bubbles: true,
      cancelable: true,
      composed: true,
      ...mods,
    });
    const target = selector
      ? `document.querySelector(${JSON.stringify(selector)})`
      : "document.activeElement";
    await this.eval(
      `(() => { const el = ${target} || document.body; ` +
        `el.dispatchEvent(new KeyboardEvent("keydown", ${init})); return true; })()`,
    );
    return this.activeElement();
  }
}
