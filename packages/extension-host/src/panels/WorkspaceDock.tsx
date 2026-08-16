import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useSnapshot } from "valtio";
import {
  DockviewReact,
  positionToDirection,
  type DockviewApi,
  type DockviewDidDropEvent,
  type DockviewReadyEvent,
  type DockviewWillDropEvent,
} from "dockview";
import { store } from "../state/store";
import { markStartupLayoutReady } from "../extension-host/startup-status";
import {
  openEditor,
  removeEditor,
  removeTerminal,
  promotePreviewEditor,
  findEditor,
} from "../state/workspaces";
import { tauriTerminalClient } from "../services/tauri-terminal-client";
import {
  dockPanelKindRegistry,
  getDockComponents,
} from "../extension-host/dock-panel-kinds";
import { ErrorBoundary } from "../components/ErrorBoundary";
import {
  setActiveDockApi,
  focusPanelContent,
} from "../docked/dock-api-registry";
import {
  peekPanelActivation,
  clearPanelActivation,
} from "../docked/panel-activation-requests";
import { getDndService, resolveDndMode } from "../extension-host/dnd-service";
import { DND_MIME } from "@silo-code/sdk";
import { setActiveTerminal } from "../extension-host/active-terminal-registry";
import { setContextKey } from "../extension-host/context-keys";
import { resolveEditorForRecord } from "../extension-host/editor-registry";
import { blurTextareaWithin } from "../extension-host/use-focus-retry";
import { confirm } from "../extension-host/modal-service";
import { getThemeBase } from "../layout/presets";
import { DockTab } from "./DockTab";
import { EmptyWatermark } from "./EmptyWatermark";
import { GroupAddMenu } from "./GroupAddMenu";
import {
  findEditorTargetGroup,
  panelToReactivateOnClose,
  resolveActivationTarget,
} from "./dock-helpers";

const dnd = getDndService();

export function WorkspaceDock({
  workspaceId,
  active,
}: {
  workspaceId: string;
  active: boolean;
}) {
  const snap = useSnapshot(store);
  const ws = snap.workspaces[workspaceId];
  const kinds = useSyncExternalStore(
    (cb) => dockPanelKindRegistry.onChange(cb).dispose,
    () => dockPanelKindRegistry.list(),
  );
  // Recompute the dockview components map whenever a new DockPanelKind is
  // registered (including external extensions that activate after mount).
  const dockComponents = useMemo(getDockComponents, [kinds]);
  const [api, setApi] = useState<DockviewApi | null>(null);
  const mountedPanelIds = useRef<Set<string>>(new Set());
  const layoutRestoredRef = useRef(false);
  const layoutSaveTimer = useRef<number | null>(null);
  const apiRef = useRef<DockviewApi | null>(null);
  // Tracks the dockview panel that was active when this workspace last went
  // inactive, so we can restore the correct panel on return rather than
  // whatever dockview happens to remember after a force-layout pass.
  const lastActivePanelRef = useRef<string | null>(null);

  function onReady(event: DockviewReadyEvent) {
    setApi(event.api);
    apiRef.current = event.api;
  }

  useEffect(() => {
    // Wait for installed extensions to finish activating before restoring layout:
    // external extensions register their DockPanelKinds during loadInstalled(),
    // so fromJSON must not run until they're all present in dockComponents.
    if (!api || !ws || !snap.extensionsReady || layoutRestoredRef.current)
      return;
    const saved = ws.dockLayout as
      | Parameters<DockviewApi["fromJSON"]>[0]
      | null;
    if (saved && typeof saved === "object") {
      try {
        api.fromJSON(saved);
        // Remove any groups that were saved empty (they'd show the EmptyWatermark).
        for (const group of api.groups) {
          if (group.panels.length === 0) api.removeGroup(group);
        }
        api.panels.forEach((p) => mountedPanelIds.current.add(p.id));
      } catch (err) {
        console.warn("fromJSON failed, ignoring saved layout", err);
      }
    }
    layoutRestoredRef.current = true;
    // Cold-start StatusBar: how many tabs will attach an existing session?
    const restorable = (ws.terminals ?? []).filter((t) => !!t.sessionId).length;
    markStartupLayoutReady(restorable);
  }, [api, ws, snap.extensionsReady]);

  useEffect(() => {
    if (!api || !ws || !layoutRestoredRef.current) return;
    const desired = new Set<string>();
    ws.terminals.forEach((t) => desired.add(`terminal:${t.id}`));
    ws.editors.forEach((e) => desired.add(`editor:${e.id}`));

    for (const panelId of [...mountedPanelIds.current]) {
      // Only reconcile panels owned by the workspace terminal/editor lists.
      // Custom DockPanelKind panels (web-viewer, image-viewer, etc.) are not
      // tracked in ws.terminals/ws.editors — they persist via ws.dockLayout and
      // are restored by fromJSON. Removing them here would cull them on every
      // workspace switch or terminal/editor change.
      const isManaged =
        panelId.startsWith("terminal:") || panelId.startsWith("editor:");
      if (!isManaged) continue;
      if (!desired.has(panelId)) {
        const panel = api.getPanel(panelId);
        if (panel) api.removePanel(panel);
        mountedPanelIds.current.delete(panelId);
      }
    }

    for (const t of ws.terminals) {
      const panelId = `terminal:${t.id}`;
      if (mountedPanelIds.current.has(panelId)) continue;
      if (api.getPanel(panelId)) {
        mountedPanelIds.current.add(panelId);
        continue;
      }
      const panel = api.addPanel({
        id: panelId,
        component: "terminal",
        title: t.title,
        params: { terminalId: t.id },
      });
      // Force-activate so a newly-created terminal (Cmd+T / "New Terminal")
      // takes focus, instead of leaving keystrokes going to the editor you were
      // in. Only newly-added panels reach here — restored ones are already
      // tracked in mountedPanelIds — so this never fights layout restore. Mirror
      // of the editor loop below.
      panel.api.setActive();
      mountedPanelIds.current.add(panelId);
    }

    for (const e of ws.editors) {
      const panelId = `editor:${e.id}`;
      if (mountedPanelIds.current.has(panelId)) continue;
      if (api.getPanel(panelId)) {
        mountedPanelIds.current.add(panelId);
        continue;
      }
      const targetGroup = findEditorTargetGroup(api);
      const panel = api.addPanel({
        id: panelId,
        component: "editor",
        title: e.title,
        params: { editorId: e.id },
        position: targetGroup ? { referenceGroup: targetGroup } : undefined,
      });
      // Force-activate so DOM focus lands on the new tab — without this a
      // previously-focused terminal/editor keeps swallowing keystrokes.
      panel.api.setActive();
      mountedPanelIds.current.add(panelId);
    }
  }, [api, ws, ws?.terminals.length, ws?.editors.length]);

  useEffect(() => {
    if (!api) return;
    function persist() {
      const wsRef = store.workspaces[workspaceId];
      if (!wsRef || !api) return;
      try {
        wsRef.dockLayout = api.toJSON();
      } catch (err) {
        console.warn("toJSON failed", err);
      }
    }
    function schedule() {
      if (!layoutRestoredRef.current) return;
      if (layoutSaveTimer.current) window.clearTimeout(layoutSaveTimer.current);
      layoutSaveTimer.current = window.setTimeout(persist, 250);
    }
    const sub = api.onDidLayoutChange(schedule);
    return () => {
      sub.dispose();
      if (layoutSaveTimer.current) {
        window.clearTimeout(layoutSaveTimer.current);
        layoutSaveTimer.current = null;
        persist();
      }
    };
  }, [api, workspaceId]);

  useEffect(() => {
    if (!active || !api) return;
    const liveApi = api;
    setActiveDockApi(liveApi, workspaceId);
    const root =
      (liveApi as unknown as { element?: HTMLElement }).element ?? null;

    // This dock is the SINGLE authority over which panel is active in its
    // workspace. Nothing outside it calls setActive() on a workspace switch:
    // a caller that wants a specific panel (ctx.terminals.focus() for a
    // terminal in another workspace) records a request
    // (panel-activation-requests) and we apply it here, ahead of the
    // last-visited restore. Two callers each firing their own setActive() on
    // their own timing is what made the requested tab flash active and then
    // flip back to the workspace's remembered tab.
    //
    // `applyTarget` returns whether it moved the active tab, so the focus
    // fallback below knows whether focus is already being driven.
    let movedActivePanel = false;
    function applyTarget(): void {
      const requestedId = peekPanelActivation(workspaceId);
      const { targetId } = resolveActivationTarget(
        requestedId,
        lastActivePanelRef.current,
        (id) => !!liveApi.getPanel(id),
      );
      if (!targetId) return; // nothing mounted to switch to (or still waiting)
      if (targetId === requestedId) clearPanelActivation(workspaceId);
      const panel = liveApi.getPanel(targetId);
      if (!panel || panel === liveApi.activePanel) return;
      panel.api.setActive();
      movedActivePanel = true;
      // Focus follows the tab switch, scoped to this panel's own content —
      // never a group-wide search, which can land on the previous tab's
      // still-visible content (see focusPanelContent).
      focusPanelContent(panel.view.content.element);
    }
    applyTarget();

    // A request can arrive before its panel exists: a workspace visited for the
    // first time this session mounts its dock now, and restores its layout /
    // reconciles its terminal+editor panels in later commits. Apply the pending
    // request the moment the panel shows up — no timer, no guessed mount delay.
    const addSub = liveApi.onDidAddPanel(() => {
      if (peekPanelActivation(workspaceId)) applyTarget();
    });

    // Delay the focus fallback until after relayoutAndRefit (2 RAFs away) to
    // prevent a one-frame editor flash. layout(force=true) can briefly hand
    // active status to Monaco; firing it immediately would land in the editor,
    // get disrupted on RAF 2, and produce a visible focus flicker.
    // useFocusOnActive inside each panel component drives focus from
    // relayoutAndRefit's setActive() call; this is a fallback for the case
    // where the active panel didn't change (no onDidActiveChange fires, so
    // useFocusOnActive never triggers) — when applyTarget DID switch tabs it
    // has already driven focus, and re-driving it here would be a second,
    // competing focus intent.
    let cancelled = false;
    let rafId = 0;
    let frame = 0;
    const step = () => {
      frame++;
      if (frame < 3) {
        if (!cancelled) rafId = requestAnimationFrame(step);
        return;
      }
      if (cancelled || movedActivePanel) return;
      const panel = liveApi.activePanel;
      if (panel) focusPanelContent(panel.view.content.element);
    };
    rafId = requestAnimationFrame(step);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      addSub.dispose();
      // Drop any request that never became applicable (its panel never
      // mounted) so it can't yank a tab on some later, unrelated visit.
      clearPanelActivation(workspaceId);
      // Save which panel was active so we can restore it on the next visit.
      lastActivePanelRef.current = liveApi.activePanel?.id ?? null;
      // Dispatch synthetic blur/focusout to reset Monaco's _hasFocus tracker.
      // While the dock is invisible the real blur is often dropped, leaving
      // Monaco believing it still owns focus; without this it re-steals via
      // _setAndWriteTextAreaState the next time the workspace becomes visible.
      blurTextareaWithin(root);
      setActiveDockApi(null);
    };
  }, [active, api, workspaceId]);

  // Push the active editor + editor-view ids into the extension context-keys so
  // menu items / keybindings with `when` clauses can react, and so that
  // saveActiveEditor() can dispatch to the right editor based on dock state
  // (not Monaco's focus events, which are unreliable across workspace
  // switches).
  useEffect(() => {
    if (!active || !api) return;
    function update() {
      if (!api) return;
      const panel = api.activePanel;
      setActiveTerminal(
        panel?.id.startsWith("terminal:")
          ? ((panel.params as { terminalId?: string } | undefined)
              ?.terminalId ?? panel.id.slice("terminal:".length))
          : null,
      );
      if (!panel || !panel.id.startsWith("editor:")) {
        setContextKey("activeEditorId", null);
        setContextKey("activeEditorViewId", null);
        return;
      }
      const editorId = (panel.params as { editorId?: string } | undefined)
        ?.editorId;
      if (!editorId) {
        setContextKey("activeEditorId", null);
        setContextKey("activeEditorViewId", null);
        return;
      }
      setContextKey("activeEditorId", editorId);
      const record = findEditor(workspaceId, editorId);
      // Diff tabs have no editor presenter — resolveEditorForRecord would
      // match the file's text editor, producing a viewId/mode mismatch.
      if (record?.mode === "diff") {
        setContextKey("activeEditorViewId", null);
      } else {
        try {
          const editor = resolveEditorForRecord(record);
          setContextKey("activeEditorViewId", editor.id);
        } catch {
          setContextKey("activeEditorViewId", null);
        }
      }
    }
    update();
    const subPanel = api.onDidActivePanelChange(update);
    const subGroup = api.onDidActiveGroupChange(update);
    return () => {
      subPanel.dispose();
      subGroup.dispose();
      setActiveTerminal(null);
      setContextKey("activeEditorId", null);
      setContextKey("activeEditorViewId", null);
    };
  }, [active, api, workspaceId]);

  useEffect(() => {
    if (!api || !active) return;
    const liveApi = api;
    function relayoutAndRefit() {
      const root = (liveApi as unknown as { element?: HTMLElement }).element;
      const host = root?.parentElement;
      const width = host?.clientWidth ?? 0;
      const height = host?.clientHeight ?? 0;
      // Snapshot active panel before layout — layout(force=true) fires
      // onDidActiveChange and can hand active status to the wrong panel.
      const savedPanel = liveApi.activePanel;
      if (width > 0 && height > 0) {
        try {
          liveApi.layout(width, height, true);
        } catch {
          /* no-op */
        }
      }
      // Restore the correct active panel unconditionally — both to counter any
      // active-slot change layout() made, and to trigger useFocusOnActive inside
      // the panel so its retryFocus loop starts. This runs even when the layout
      // call was skipped (zero dims) so focus is always driven on activation.
      savedPanel?.api.setActive();
      window.dispatchEvent(new CustomEvent("app:refit-terminals"));
    }
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(relayoutAndRefit);
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [api, active]);

  // Show dockview's split/tab overlay for file drags — unless the drag is in
  // "paste" mode (Shift), in which case our custom full-panel overlay (drawn
  // from file-drag-ghost, behind ctx.dnd) takes over instead.
  useEffect(() => {
    if (!api) return;
    const sub = api.onUnhandledDragOverEvent((event) => {
      if (!event.nativeEvent.dataTransfer?.types.includes(DND_MIME.filePath))
        return;
      if (resolveDndMode(event.nativeEvent) === "paste") return;
      event.accept();
    });
    return () => sub.dispose();
  }, [api]);

  // Suppress dockview's blue split/tab overlay whenever paste-mode is held —
  // covers tab drags too, where the PanelTransfer signal makes
  // `onUnhandledDragOverEvent` short-circuit before our handler can
  // veto. Our custom full-panel paste overlay (from file-drag-ghost)
  // shows instead.
  useEffect(() => {
    if (!api) return;
    const sub = api.onWillShowOverlay((event) => {
      if (resolveDndMode(event.nativeEvent) === "paste") event.preventDefault();
    });
    return () => sub.dispose();
  }, [api]);

  // When the user starts dragging an editor tab, mirror what file-tree drags
  // do via ctx.dnd: write the DND_MIME.filePath payload and start the ghost.
  // dockview's own PanelTransfer data goes through a separate
  // LocalSelectionTransfer (not the HTML5 dataTransfer), so adding our
  // MIME doesn't disturb its tab-split behavior. Shift-held drops then
  // route into our terminal/editor paste handlers instead.
  useEffect(() => {
    if (!api) return;
    const sub = api.onWillDragPanel((event) => {
      if (!event.panel.id.startsWith("editor:")) return;
      const editorId = (event.panel.params as { editorId?: string } | undefined)
        ?.editorId;
      if (!editorId) return;
      const rec = findEditor(workspaceId, editorId);
      if (!rec?.filePath) return; // untitled buffers have no path to paste
      dnd.beginDrag(event.nativeEvent, {
        items: [
          { mime: DND_MIME.filePath, value: rec.filePath },
          { mime: DND_MIME.text, value: rec.filePath },
        ],
        label: rec.title,
      });
    });
    return () => sub.dispose();
  }, [api, workspaceId]);

  // Paste-mode drops are handled by the terminal / editor panel under the
  // cursor. Cancel dockview's would-be panel-add so we don't ALSO open the
  // file as a new tab on top of the paste.
  const onWillDrop = useCallback((event: DockviewWillDropEvent) => {
    if (!event.nativeEvent.dataTransfer?.types.includes(DND_MIME.filePath))
      return;
    if (resolveDndMode(event.nativeEvent) === "paste") event.preventDefault();
  }, []);

  const onDidDrop = useCallback(
    (event: DockviewDidDropEvent) => {
      // Defensive: if Shift was held at drop time but `onWillDrop` somehow
      // didn't cancel (e.g. event-state mismatch), skip the panel-add here.
      // The paste itself is handled by the terminal/editor capture-phase
      // drop listeners.
      if (resolveDndMode(event.nativeEvent) === "paste") return;
      const path = event.nativeEvent.dataTransfer?.getData(DND_MIME.filePath);
      if (!path || !event.group) return;
      const rec = openEditor(workspaceId, path);
      const panelId = `editor:${rec.id}`;
      const existing = event.api.getPanel(panelId);
      if (existing) {
        existing.api.setActive();
        return;
      }
      const panel = event.api.addPanel({
        id: panelId,
        component: "editor",
        title: rec.title,
        params: { editorId: rec.id },
        position: {
          referenceGroup: event.group,
          direction: positionToDirection(event.position),
        },
      });
      panel.api.setActive();
      mountedPanelIds.current.add(panelId);
    },
    [workspaceId],
  );

  useEffect(() => {
    if (!api) return;
    const sub = api.onDidRemovePanel((panel) => {
      const [kind, id] = panel.id.split(":");
      if (!id) return;
      mountedPanelIds.current.delete(panel.id);
      // dockview fires this *before* its own within-group reactivation, so
      // api.activePanel is still whatever was active before the close. If the
      // closed tab wasn't the active one, re-assert that tab once dockview's
      // reactivation has run (next microtask) so closing a tab in one group
      // can't steal focus into another group. setActive is enough — the
      // viewer's useFocusOnActive restores DOM focus from there.
      const reactivateId = panelToReactivateOnClose(
        panel.id,
        api.activePanel?.id ?? null,
      );
      if (reactivateId) {
        queueMicrotask(() => api.getPanel(reactivateId)?.api.setActive());
      }
      if (kind === "terminal") {
        const rec = removeTerminal(workspaceId, id);
        if (rec?.sessionId) {
          tauriTerminalClient
            .deleteTerminal(rec.sessionId)
            .catch((err) => console.warn("delete terminal failed", err));
        }
      } else if (kind === "editor") {
        removeEditor(workspaceId, id);
      }
    });
    return () => sub.dispose();
  }, [api, workspaceId]);

  // Promote a preview tab to permanent when the user drags it to a new location.
  useEffect(() => {
    if (!api) return;
    const sub = api.onDidMovePanel((event) => {
      const panelId = event.panel.id;
      if (!panelId.startsWith("editor:")) return;
      const editorId = panelId.slice(7);
      promotePreviewEditor(workspaceId, editorId);
    });
    return () => sub.dispose();
  }, [api, workspaceId]);

  // Activate a panel programmatically (used by openEditor / openPreviewEditor
  // when the target panel is already mounted).
  useEffect(() => {
    function handler(e: Event) {
      const { panelId } = (e as CustomEvent<{ panelId: string }>).detail;
      const panel = apiRef.current?.getPanel(panelId);
      if (panel) panel.api.setActive();
    }
    window.addEventListener("app:activate-panel", handler);
    return () => window.removeEventListener("app:activate-panel", handler);
  }, []);

  // Update a preview panel's dockview title when the preview slot reuses the
  // same EditorRecord for a new file (filePath mutated in place).
  useEffect(() => {
    function handler(e: Event) {
      const { editorId, title } = (
        e as CustomEvent<{ editorId: string; title: string }>
      ).detail;
      const panel = apiRef.current?.getPanel(`editor:${editorId}`);
      if (panel) panel.api.setTitle(title);
    }
    window.addEventListener("app:update-editor-title", handler);
    return () => window.removeEventListener("app:update-editor-title", handler);
  }, []);

  useEffect(() => {
    async function onConfirmClose(e: Event) {
      const { panelId, title } = (
        e as CustomEvent<{ panelId: string; title: string }>
      ).detail;
      if (!apiRef.current?.getPanel(panelId)) return;
      const ok = await confirm({
        title: "Unsaved changes",
        body: `${title} has unsaved changes. Close without saving?`,
        confirmLabel: "Close without saving",
        danger: true,
      });
      if (!ok) return;
      apiRef.current?.getPanel(panelId)?.api.close();
    }
    window.addEventListener("app:confirm-close-editor", onConfirmClose);
    return () =>
      window.removeEventListener("app:confirm-close-editor", onConfirmClose);
  }, []);

  const themeClass =
    getThemeBase(snap.activeThemeId) === "light"
      ? "dockview-theme-light"
      : "dockview-theme-dark";
  return (
    <ErrorBoundary name={`workspace-dock:${workspaceId}`}>
      <DockviewReact
        className={`${themeClass} editor-dock`}
        components={dockComponents}
        onReady={onReady}
        onDidDrop={onDidDrop}
        onWillDrop={onWillDrop}
        defaultTabComponent={DockTab}
        leftHeaderActionsComponent={GroupAddMenu}
        watermarkComponent={EmptyWatermark}
      />
    </ErrorBoundary>
  );
}
