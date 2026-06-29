import { emit, listen } from "@tauri-apps/api/event";
import type { editor as MonacoEditor } from "monaco-editor";
import {
  ensureMonaco,
  getThemeService,
  getProcessService,
  getTerminalService,
  executeCommand,
  contextKeys,
  store,
  sidePanelRegistry,
  createWorkspace,
  activateWorkspace,
  deleteWorkspace,
  openEditor,
  openDiff,
  openPreviewDiff,
  splitActivePanel,
  getOutputLogs,
} from "@silo-code/extension-host";

// --- Monaco introspection (source of truth, not DOM scraping) ---------------
// We tap Monaco's own focus events and editor/model registry via the
// @monaco-editor/react loader. This is authoritative and undo-proof: a focus
// *timeline* keyed by file URI doesn't depend on what text survives.

interface FocusEvent {
  t: number;
  type:
    | "focusText"
    | "blurText"
    | "createEditor"
    | "disposeEditor"
    | "key"
    | "edit"; // a model's content actually changed — ground truth for "where text went"
  uri: string;
  key?: string;
  activeTab?: string; // dockview's active editor tab at the moment of a keystroke
  mismatch?: boolean; // true when the keystroke's focused file != the active tab
  // Focus ground-truth captured synchronously at the moment of an `edit` — the
  // decisive signal for the focus-routing bug. `activeOwner` is the file whose
  // editor DOM contains document.activeElement (where keystrokes physically
  // land); `editors` is each live editor's Monaco focus state. A split between
  // activeOwner and the editor reporting hasTextFocus IS the desync.
  focus?: {
    activeOwner: string;
    activeEl: string; // precise identity of document.activeElement
    editors: {
      uri: string;
      hasTextFocus: boolean;
      ownsActiveEl: boolean; // this editor's DOM contains document.activeElement
      isActiveInputArea: boolean; // this editor's own .inputarea IS document.activeElement
    }[];
  };
}
const FOCUSLOG_CAP = 3000;
const focusLog: FocusEvent[] = [];
const pushLog = (e: FocusEvent) => {
  focusLog.push(e);
  if (focusLog.length > FOCUSLOG_CAP)
    focusLog.splice(0, focusLog.length - FOCUSLOG_CAP);
};
const now = () => Math.round(performance.now());
// The active editor-group tab title — the tab the user sees as current.
// Two corrections over a naive global query, both of which otherwise produce
// FALSE `mismatch` readings:
//   1. Scope to the *active workspace's* dock. Inactive workspaces stay mounted
//      (visibility:hidden, see CenterDock.css) and keep their own
//      `.dv-active-group`, so a document-wide query can return a backgrounded
//      workspace's tab.
//   2. Exclude the dirty-indicator (`●`) span from the title text, or every
//      edit to an unsaved buffer would compare "file.txt" against "●file.txt"
//      and report a mismatch that isn't one.
const activeEditorTab = (): string => {
  const host =
    document.querySelector('.dock-host[data-active="true"]') ?? document;
  const grp = host.querySelector(".dv-groupview.dv-active-group") ?? host;
  const content = grp.querySelector(
    ".dv-tab.dv-active-tab .dv-default-tab-content",
  );
  if (!content) return "(none)";
  const clone = content.cloneNode(true) as HTMLElement;
  clone.querySelector(".dvi-dirty-indicator")?.remove();
  return (clone.textContent || "").trim();
};
// Authoritative "who has text focus right now", maintained from Monaco's own
// focus/blur events — so each keystroke can be attributed to a real file.
let currentFocusUri: string | null = null;
const editorUri = (ed: MonacoEditor.ICodeEditor): string => {
  const m = ed.getModel();
  return m
    ? m.uri.toString().split("/").pop() || m.uri.toString()
    : "(no model)";
};

// A registry of every live code editor we've tapped. `monaco.editor.getEditors()`
// can return `[]` even when editors exist (see automation.md gotchas), so the
// `editorsDetail` op reads from this set instead — it's the reliable roster.
const tappedEditors = new Set<MonacoEditor.ICodeEditor>();

// Snapshot focus ground-truth across every live editor: which editor's DOM
// owns document.activeElement (where keystrokes physically go) vs. what each
// editor's Monaco focus tracker reports. Computed synchronously inside the
// edit handler so it reflects the exact moment the wrong model changed.
const focusSnapshot = (): NonNullable<FocusEvent["focus"]> => {
  const active = document.activeElement;
  const activeEl = active
    ? `${active.tagName}.${(typeof active.className === "string" ? active.className : "").slice(0, 24)}`
    : "(none)";
  let activeOwner = active ? "(non-editor)" : "(none)";
  const editors = [...tappedEditors].map((ed) => {
    const m = ed.getModel();
    const uri = m
      ? m.uri.toString().split("/").pop() || m.uri.toString()
      : "(no model)";
    const node = ed.getDomNode();
    const ownsActiveEl = !!node && !!active && node.contains(active);
    const inputArea = node?.querySelector("textarea.inputarea") ?? null;
    const isActiveInputArea = !!inputArea && inputArea === active;
    if (ownsActiveEl) activeOwner = uri;
    return {
      uri,
      hasTextFocus: ed.hasTextFocus(),
      ownsActiveEl,
      isActiveInputArea,
    };
  });
  return { activeOwner, activeEl, editors };
};

let monacoInstrumented = false;
async function instrumentMonaco(): Promise<typeof import("monaco-editor")> {
  // Route through ensureMonaco() so the @monaco-editor/react loader is
  // configured with the bundled ESM instance BEFORE it initializes. Calling
  // loader.init() directly (which the bridge runs at startup, ahead of the
  // lazy editor's ensureMonaco) used to lock the loader onto a *second*,
  // AMD-loaded monaco instance — leaving the editors on an instance that never
  // received our app-dark/app-light themes, so they fell back to Monaco's
  // default theme and ignored the active Silo theme entirely.
  const monaco = ensureMonaco();
  if (!monacoInstrumented) {
    monacoInstrumented = true;
    const tap = (ed: MonacoEditor.ICodeEditor) => {
      tappedEditors.add(ed);
      ed.onDidFocusEditorText(() => {
        currentFocusUri = editorUri(ed);
        pushLog({ t: now(), type: "focusText", uri: currentFocusUri });
      });
      ed.onDidBlurEditorText(() => {
        const uri = editorUri(ed);
        if (currentFocusUri === uri) currentFocusUri = null;
        pushLog({ t: now(), type: "blurText", uri });
      });
      ed.onDidDispose(() => {
        tappedEditors.delete(ed);
        pushLog({ t: now(), type: "disposeEditor", uri: editorUri(ed) });
      });
    };
    monaco.editor.getEditors().forEach(tap);
    monaco.editor.onDidCreateEditor((ed: MonacoEditor.ICodeEditor) => {
      pushLog({ t: now(), type: "createEditor", uri: editorUri(ed) });
      tap(ed);
    });

    // GROUND TRUTH: tap every model's content changes. Whichever model fires
    // here is where the text actually went — independent of focus/DOM/undo.
    const tapModel = (model: MonacoEditor.ITextModel) => {
      const base =
        model.uri.toString().split("/").pop() || model.uri.toString();
      model.onDidChangeContent((e) => {
        const text = e.changes.map((c) => c.text).join("");
        pushLog({
          t: now(),
          type: "edit",
          uri: base,
          key: JSON.stringify(text).slice(0, 20),
          activeTab: activeEditorTab(),
          mismatch: base !== activeEditorTab(),
          focus: focusSnapshot(),
        });
      });
    };
    monaco.editor.getModels().forEach(tapModel);
    monaco.editor.onDidCreateModel(tapModel);

    // Each keystroke, tagged with Monaco's focused file AND dockview's active
    // tab; mismatch=true means they disagree (the bug signature).
    window.addEventListener(
      "keydown",
      (e) => {
        const tab = activeEditorTab();
        const focused = currentFocusUri ?? "(none)";
        pushLog({
          t: now(),
          type: "key",
          uri: focused,
          key: e.key,
          activeTab: tab,
          mismatch: focused !== "(none)" && focused !== tab,
        });
      },
      true,
    );
    // Pin the moment a tab is clicked and where DOM focus lands in between.
    const describe = (el: Element | null): string => {
      if (!el) return "(null)";
      if (el.closest(".dv-tab"))
        return (
          "tab:" +
          (el.closest(".dv-tab")?.textContent || "").trim().slice(0, 16)
        );
      if (el.classList?.contains("inputarea")) return "monaco-inputarea";
      if (el.closest(".xterm")) return "xterm";
      return (
        el.tagName +
        "." +
        (typeof el.className === "string" ? el.className.slice(0, 18) : "")
      );
    };
    document.addEventListener(
      "mousedown",
      (e) => {
        const tab = (e.target as Element)?.closest?.(".dv-tab");
        if (tab)
          pushLog({
            t: now(),
            type: "key",
            uri: "TABCLICK:" + (tab.textContent || "").trim().slice(0, 16),
          });
      },
      true,
    );
    document.addEventListener(
      "focusin",
      (e) =>
        pushLog({
          t: now(),
          type: "key",
          uri: "DOMFOCUS:" + describe(e.target as Element),
        }),
      true,
    );
  }
  return monaco as typeof import("monaco-editor");
}

// Dev-only automation bridge — the webview half of the loopback RPC defined in
// `src-tauri/src/commands/automation.rs`. The Rust server emits an
// `automation://request` event per RPC call; we run the op against the live app
// and emit `automation://reply` with the result. Loaded only under
// `import.meta.env.DEV` (see main.tsx), so it never ships in a release bundle.

interface RequestEvent {
  id: number;
  op: string;
  args: Record<string, unknown>;
}

/** Start listening for automation requests. Inert until the Rust server (dev
 * builds only — see the `automation` Cargo feature) starts emitting them. */
export async function initAutomationBridge(): Promise<void> {
  await listen<RequestEvent>("automation://request", async (event) => {
    const { id, op, args } = event.payload;
    let result: unknown = null;
    let error: string | null = null;
    try {
      result = await handleOp(op, args ?? {});
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    await emit("automation://reply", { id, result, error });
  });
  // Tap Monaco focus events up front so the timeline is complete.
  instrumentMonaco().catch((err) =>
    console.error("[automation] monaco instrument failed", err),
  );
  console.info("[automation] bridge ready");
}

async function handleOp(
  op: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (op) {
    // Run a registered command by id (the same dispatch menus/keybindings use).
    case "exec":
      return { ran: executeCommand(String(args.command ?? "")) };

    // Describe what currently holds DOM focus — the signal focus tests need.
    case "activeElement":
      return describeActiveElement();

    // Snapshot the host context-keys (activeEditorId / activeViewerId / ...).
    case "contextKeys":
      return { ...contextKeys };

    // Dev escape hatch: evaluate an expression in the page. Powerful and
    // unsafe — which is exactly why the whole surface is triple-gated.
    case "eval": {
      const expr = String(args.expr ?? "");
      const value = (0, eval)(expr); // eslint-disable-line no-eval
      return value instanceof Promise ? await value : value;
    }

    // --- Test-driver ops -----------------------------------------------------
    // Drive the app to set up scenarios that the registered commands only reach
    // through pickers/clicks (which automation can't operate). Call the same
    // state APIs the UI does, so behavior under test (focus, activation) is
    // faithful. Intended for a sandbox workspace — never point at real files.

    case "listWorkspaces":
      return {
        active: store.activeWorkspaceId,
        workspaces: store.workspaceOrder.map((id) => {
          const w = store.workspaces[id];
          return { id, name: w?.name, folder: w?.folder };
        }),
      };

    case "openWorkspace": {
      const folder = String(args.folder ?? "");
      const name = String(args.name ?? folder.split("/").pop() ?? "test");
      const ws = createWorkspace({ folder, name });
      activateWorkspace(ws.id);
      return { id: ws.id };
    }

    case "activateWorkspace": {
      activateWorkspace(String(args.id ?? ""));
      return { active: store.activeWorkspaceId };
    }

    // Asserted teardown: fully remove a workspace entry. deleteWorkspace()
    // switches the active workspace away first (pickNextOpen), so a test can
    // then safely delete the sandbox folder it pointed at. Returns the verified
    // end state — `deleted` is true only if the id is truly gone from the store.
    case "deleteWorkspace": {
      const id = String(args.id ?? "");
      // Mirror the real UI delete path (WorkspacesPanel.confirmDelete): reap the
      // workspace's terminal sessions before removing it, so no PTYs leak.
      getTerminalService().closeWorkspace(id);
      deleteWorkspace(id);
      const deleted =
        !store.workspaces[id] && !store.workspaceOrder.includes(id);
      return { deleted, active: store.activeWorkspaceId };
    }

    case "openFile": {
      const rec = openEditor(requireActiveWorkspace(), String(args.path ?? ""));
      return { editorId: rec.id, panelId: `editor:${rec.id}` };
    }

    case "openTerminal": {
      // Drive the real ctx.terminals.create path (not addTerminal directly), so
      // the bridge exercises the same public API the menu does.
      const rec = getTerminalService().create({
        workspaceId: requireActiveWorkspace(),
        cwd: args.cwd ? String(args.cwd) : undefined,
      });
      if (!rec) throw new Error("openTerminal: no active workspace");
      return { terminalId: rec.id, panelId: `terminal:${rec.id}` };
    }

    case "listTerminals": {
      const wsId = args.workspaceId
        ? String(args.workspaceId)
        : store.activeWorkspaceId;
      const ws = wsId ? store.workspaces[wsId] : null;
      return {
        terminals: (ws?.terminals ?? []).map((t) => ({
          id: t.id,
          title: t.title,
          sessionId: t.sessionId,
          kind: t.kind,
        })),
      };
    }

    // The editor tab model for a workspace (text + diff records alike), with the
    // preview-tab lifecycle fields. Lets a test assert that a diff opens as a
    // temporary/preview tab and shares promotion with text — the unified
    // editor-record behavior (ctx-domains.md → "The editor surface").
    case "listEditors": {
      const wsId = args.workspaceId
        ? String(args.workspaceId)
        : store.activeWorkspaceId;
      const ws = wsId ? store.workspaces[wsId] : null;
      return {
        previewEditorId: ws?.previewEditorId ?? null,
        editors: (ws?.editors ?? []).map((e) => ({
          id: e.id,
          filePath: e.filePath,
          title: e.title,
          isPreview: !!e.isPreview,
          mode: e.mode ?? "text",
          providerId: e.providerId ?? null,
        })),
      };
    }

    case "openDiff": {
      // Generic, extension-agnostic: the caller names the content provider
      // (e.g. "silo.git"). The bridge stays decoupled from any specific
      // extension — diff content is whatever the named provider resolves. A
      // diff is an editor record (mode "diff") now, so its panel id is `editor:`
      // and `diffId` is the editor record id (the model URIs are keyed on it).
      const spec = {
        filePath: String(args.path ?? ""),
        providerId: String(args.providerId ?? ""),
        args: (args.args as Record<string, unknown> | undefined) ?? undefined,
        title: args.title === undefined ? undefined : String(args.title),
      };
      const ws = requireActiveWorkspace();
      const rec = args.preview ? openPreviewDiff(ws, spec) : openDiff(ws, spec);
      return { diffId: rec.id, panelId: `editor:${rec.id}` };
    }

    // Move the active center panel into a new split group, so a test can build a
    // multi-group center (editor + terminal) and exercise the active-group focus
    // restore on re-entry. Returns the resulting group count.
    case "splitActivePanel": {
      const position = args.position
        ? (String(args.position) as "left" | "right" | "top" | "bottom")
        : "right";
      return { groups: splitActivePanel(position) };
    }

    case "activatePanel": {
      const panelId = String(args.panelId ?? "");
      window.dispatchEvent(
        new CustomEvent("app:activate-panel", { detail: { panelId } }),
      );
      return { activated: panelId };
    }

    // Bring a registered side panel into view: expand its slot, then activate
    // its tab the same way a user does. The tab bar (`TabBar`) drives activation
    // from a pointerdown/up sequence, not a DOM `click` — so a plain `.click()`
    // is a no-op here (its handler reads `e.target.closest("button.tab")` off a
    // real pointer event). We dispatch the pointer sequence on the tab button
    // itself so the bar's delegated handler sees the button as the target. The
    // active tab is local component state, so writing the store alone won't
    // switch it. Side panels are lazy-mounted, so this is how a test wakes one
    // up — e.g. the git panel — before asserting on it or its watch.
    case "showSidePanel": {
      const id = String(args.id ?? "");
      const panel = sidePanelRegistry.get(id);
      if (!panel) return { shown: false, error: `no side panel "${id}"` };
      const slot = store.sidePanelLocations[id] ?? panel.location;
      // Uncollapse the slot's column (reactive via the store snapshot).
      if (slot.startsWith("left")) store.leftPanelCollapsed = false;
      else store.rightPanelCollapsed = false;
      // Let the expand render the tab bar, then activate the panel's tab.
      await new Promise((r) => setTimeout(r, 60));
      const tab = document.querySelector<HTMLElement>(
        `[data-panel-id="${CSS.escape(id)}"]`,
      );
      if (!tab)
        return { shown: false, slot, error: "tab not found after expand" };
      const rect = tab.getBoundingClientRect();
      const pointer = {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        button: 0,
        buttons: 1,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
      } as const;
      tab.dispatchEvent(new PointerEvent("pointerdown", pointer));
      tab.dispatchEvent(new PointerEvent("pointerup", pointer));
      return { shown: true, slot };
    }

    // --- Theme ops -----------------------------------------------------------
    // Drive + read the theme domain through ctx.theme (the real service path),
    // so regression tests can switch themes deterministically instead of
    // clicking the picker, and assert on the merged preset set.

    case "themeState": {
      const s = getThemeService().getState();
      return {
        activeId: s.activeId,
        presets: s.presets.map((p) => ({
          id: p.id,
          name: p.name,
          base: p.base,
        })),
        customThemes: s.customThemes.map((c) => ({
          id: c.id,
          name: c.name,
          base: c.base,
        })),
      };
    }

    case "setTheme": {
      getThemeService().setActive(String(args.id ?? ""));
      return { activeId: getThemeService().getState().activeId };
    }

    // --- Monaco introspection ops (authoritative) ---------------------------

    // Live editors straight from Monaco's registry, with real focus state.
    case "monacoEditors": {
      const monaco = await instrumentMonaco();
      return monaco.editor.getEditors().map((ed) => {
        const m = ed.getModel();
        return {
          uri: m ? m.uri.toString().split("/").pop() : null,
          hasTextFocus: ed.hasTextFocus(),
          valueLength: m ? m.getValue().length : 0,
          valueTail: m ? m.getValue().slice(-24) : "",
        };
      });
    }

    // Per-editor ground truth for the focus-handoff bug: for every live editor,
    // does it report `hasTextFocus()`, is *its* textarea the real
    // `document.activeElement`, and is its container actually visible? Reads the
    // tapped-editor registry (not getEditors(), which can lie with []). The
    // bug signature is one editor with hasTextFocus:true while a *different*
    // editor has textareaIsActiveElement:true.
    case "editorsDetail": {
      await instrumentMonaco();
      const active = document.activeElement;
      return [...tappedEditors].map((ed) => {
        const m = ed.getModel();
        const node = ed.getDomNode();
        const textarea = node?.querySelector("textarea.inputarea") ?? null;
        const rect = node?.getBoundingClientRect();
        return {
          modelUri: m ? m.uri.toString() : null,
          hasTextFocus: ed.hasTextFocus(),
          textareaIsActiveElement: !!textarea && textarea === active,
          containerVisible:
            !!node &&
            node.offsetParent !== null &&
            !!rect &&
            rect.width > 0 &&
            rect.height > 0,
        };
      });
    }

    // The focus-event timeline (Monaco's own events, undo-proof). Pass
    // {clear:true} to reset it before a fresh reproduction.
    case "focusLog": {
      await instrumentMonaco();
      if (args.clear) {
        focusLog.length = 0;
        return { cleared: true };
      }
      return focusLog.slice();
    }

    // Read any model's content by URI substring (even if its panel is hidden,
    // as long as the model is still alive). instrumentMonaco() now returns the
    // single bundled instance the editor viewers actually use, so getModels()
    // here is authoritative (no more window.monaco fallback).
    case "editorContent": {
      const monaco = await instrumentMonaco();
      const needle = String(args.uri ?? "");
      const model = monaco.editor
        .getModels()
        .find((m) => m.uri.toString().includes(needle));
      return model
        ? { uri: model.uri.toString(), value: model.getValue() }
        : null;
    }

    // Resolved Monaco configuration for the editor whose model URI contains
    // `uri` — the single source of truth for "which settings actually reached
    // the editor." Pins the text-vs-diff option divergence (font size, minimap,
    // whitespace, readOnly) so the core.editor consolidation can prove text and
    // diff modes converge to the same config except where intended. `getOption`
    // reads the *computed* options (post-construction), and tab settings come
    // off the model, so this reflects what the editor is really rendering with.
    case "editorOptions": {
      const monaco = await instrumentMonaco();
      const needle = String(args.uri ?? "");
      const ed = monaco.editor
        .getEditors()
        .find((e) => e.getModel()?.uri.toString().includes(needle));
      if (!ed) return null;
      const m = ed.getModel();
      const EO = monaco.editor.EditorOption;
      const modelOpts = m?.getOptions();
      return {
        uri: m ? m.uri.toString() : null,
        language: m ? m.getLanguageId() : null,
        fontSize: ed.getOption(EO.fontInfo).fontSize,
        tabSize: modelOpts?.tabSize ?? null,
        insertSpaces: modelOpts?.insertSpaces ?? null,
        wordWrap: ed.getOption(EO.wordWrap),
        minimap: ed.getOption(EO.minimap).enabled,
        renderWhitespace: ed.getOption(EO.renderWhitespace),
        renderLineHighlight: ed.getOption(EO.renderLineHighlight),
        readOnly: ed.getOption(EO.readOnly),
      };
    }

    // Replace the content of the editor whose model URI contains `uri`, the
    // same way a content change reaches the app — `model.setValue` fires
    // `onDidChangeModelContent`, which is what @monaco-editor/react's `onChange`
    // (and therefore the dirty tracking + save path) listens to. Lets a test
    // exercise edit → dirty → save without needing OS keyboard focus on the
    // window (synthetic keystrokes require the window be frontmost; model edits
    // don't). Returns the new value length, or null if no model matched.
    case "setEditorValue": {
      const monaco = await instrumentMonaco();
      const needle = String(args.uri ?? "");
      const value = String(args.value ?? "");
      const model = monaco.editor
        .getModels()
        .find((m) => m.uri.toString().includes(needle));
      if (!model) return null;
      model.setValue(value);
      return { uri: model.uri.toString(), valueLength: value.length };
    }

    // Run a one-shot command through the real `ctx.process.exec` service path
    // (not the raw host command), so a test characterizes the public primitive
    // the git extension is built on: stdout/stderr/code, non-zero-resolves, and
    // off-the-UI-thread execution.
    case "processExec": {
      const command = String(args.command ?? "");
      const cmdArgs = Array.isArray(args.args) ? (args.args as string[]) : [];
      const cwd = args.cwd === undefined ? undefined : String(args.cwd);
      return getProcessService().exec(command, cmdArgs, { cwd });
    }

    // Read entries from an output channel, with optional level / search / limit
    // filters. Defaults to the first registered channel and up to 200 entries.
    case "outputLogs":
      return getOutputLogs({
        channel: args.channel !== undefined ? String(args.channel) : undefined,
        level: args.level !== undefined ? String(args.level) : undefined,
        search: args.search !== undefined ? String(args.search) : undefined,
        limit:
          args.limit !== undefined ? Number(args.limit) : undefined,
      });

    default:
      throw new Error(`unknown op: ${op}`);
  }
}

function requireActiveWorkspace(): string {
  const id = store.activeWorkspaceId;
  if (!id) throw new Error("no active workspace");
  return id;
}

function describeActiveElement() {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return null;
  return {
    tag: el.tagName,
    className: typeof el.className === "string" ? el.className : "",
    id: el.id,
    isTextarea: el instanceof HTMLTextAreaElement,
    inMonaco: !!el.closest(".monaco-editor"),
    inXterm: !!el.closest(".xterm"),
  };
}
