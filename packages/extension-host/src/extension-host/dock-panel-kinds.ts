import {
  createElement,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type FunctionComponent,
} from "react";
import { subscribe } from "valtio";
import type { IDockviewPanelProps } from "dockview";
import { store } from "../state/store";
import { Registry } from "./registry";
import { dockApiWorkspaceId } from "../docked/dock-api-registry";
import { workspaceIdForPanelRecord } from "../state/workspaces";
import { setPanelAgentSession } from "./agents/agent-surface-registry";
import {
  setPanelBreadcrumb,
  clearPanelBreadcrumb,
} from "./panel-chrome-registry";
import { DockPanelChrome } from "../panels/DockPanelChrome";
import type {
  DockPanelApi,
  DockPanelKind,
  DockPanelProps,
} from "@silo-code/sdk";

export const dockPanelKindRegistry = new Registry<DockPanelKind>();

type DockviewPanelApi = IDockviewPanelProps["api"];

/**
 * A recorded panel's dockview panel id is `${kindId}:${recordId}` — the same
 * `kind:id` shape editor (`editor:…`) and terminal (`terminal:…`) panels use.
 * Kind ids carry no colon by convention, so the split is unambiguous. Returns
 * `null` for an id that is not `kind:id` shaped or whose kind is not registered
 * as `persistence: "recorded"` (an editor, a terminal, a transient panel).
 */
export function parseRecordedPanelId(
  panelId: string,
): { kindId: string; recordId: string } | null {
  const i = panelId.indexOf(":");
  if (i <= 0) return null;
  const kindId = panelId.slice(0, i);
  const recordId = panelId.slice(i + 1);
  if (!recordId) return null;
  if (dockPanelKindRegistry.get(kindId)?.persistence !== "recorded")
    return null;
  return { kindId, recordId };
}

/** The dockview panel id for a recorded panel. */
export function recordedPanelId(kindId: string, recordId: string): string {
  return `${kindId}:${recordId}`;
}

/**
 * Adapt a dockview panel api into the SDK's {@link DockPanelApi}. Most members
 * are a straight delegation — the two surfaces were deliberately kept
 * structurally compatible — but `setAgentSession` is Silo's own: it records
 * into the agent-surface registry, which is how the host learns that this
 * panel's tab is a surface for an Agent Session (RFC 0038 Session 3.2). The
 * panel declares *what it is showing* and nothing more; every piece of agent
 * chrome on its tab is painted by whoever observes `ctx.agents`.
 */
export function makeDockPanelApi(dv: DockviewPanelApi): DockPanelApi {
  return {
    setTitle: (title) => dv.setTitle(title),
    close: () => dv.close(),
    setActive: () => dv.setActive(),
    get isActive() {
      return dv.isActive;
    },
    onDidActiveChange: (listener) =>
      dv.onDidActiveChange((e) => listener({ isActive: e.isActive })),
    get isVisible() {
      return dv.isVisible;
    },
    onDidVisibilityChange: (listener) =>
      dv.onDidVisibilityChange((e) => listener({ isVisible: e.isVisible })),
    // Dockview's own `updateParameters` **replaces** the panel's params
    // wholesale (`dockview-core`'s `PanelApiImpl` does `this._parameters =
    // parameters` — no merge at all) — the opposite of the shallow-merge
    // `DockPanelApi.updateParameters` documents. Merge here so the public
    // contract holds: a caller patching one field (a Chat panel persisting
    // just a new title — RFC 0042) must not silently wipe every other
    // persisted field (`sessionId`, `profileId`, `cwd`) it didn't mention.
    // Caught live (2026-09-09): a title-only patch was erasing the whole
    // restore identity.
    updateParameters: (params) =>
      dv.updateParameters({
        ...dv.getParameters(),
        ...(params as Record<string, unknown>),
      }),
    setAgentSession: (agentSessionId: string | null) => {
      setPanelAgentSession(dv.id, agentSessionId, {
        // Closing the panel is what `ctx.agents.close(id)` means for a session
        // with no PTY: the transcript goes away and the panel's own unmount
        // reaps the agent process, exactly as closing a terminal tab kills its
        // child.
        close: () => dv.close(),
      });
    },
    setBreadcrumb: (crumb) => setPanelBreadcrumb(dv.id, crumb),
  };
}

/**
 * The rule behind {@link DockPanelProps.onScreen}: both halves of "the user can
 * see this panel", which the host owns and no extension should have to compose.
 *
 * The tab half comes from dockview, which knows nothing about workspaces. The
 * workspace half has to come from the store, because `CenterDock` keeps every
 * warmed workspace's dock mounted and merely hides the inactive ones
 * (`visibility: hidden`) — so a panel reading dockview alone believes it is
 * visible while its whole workspace sits behind another. That is the mistake
 * this prop exists to stop, and the reason the answer is resolved here rather
 * than in each panel (ADR 0032 / ADR 0034: one authority per question).
 *
 * A panel with no resolved workspace (`""` — a transient panel in a dock whose
 * registration has not landed yet) is not on screen: better a restore that
 * arrives a render late than one aimed at a panel nobody is looking at.
 */
export function dockPanelIsOnScreen(
  tabVisible: boolean,
  activeWorkspaceId: string | null,
  workspaceId: string,
): boolean {
  if (!tabVisible || !workspaceId) return false;
  return activeWorkspaceId === workspaceId;
}

/** {@link dockPanelIsOnScreen}, wired to dockview and the store reactively. */
function useDockPanelOnScreen(
  dv: DockviewPanelApi,
  workspaceId: string,
): boolean {
  const tabVisible = useSyncExternalStore(
    useMemo(
      () => (cb: () => void) => dv.onDidVisibilityChange(cb).dispose,
      [dv],
    ),
    () => dv.isVisible,
  );
  const activeWorkspaceId = useSyncExternalStore(
    subscribeToStore,
    getActiveWorkspaceId,
  );
  return dockPanelIsOnScreen(tabVisible, activeWorkspaceId, workspaceId);
}

const subscribeToStore = (cb: () => void) => subscribe(store, cb);
const getActiveWorkspaceId = () => store.activeWorkspaceId;

/**
 * Wrap a {@link DockPanelKind.component} so dockview (which passes
 * {@link IDockviewPanelProps}) mounts it with the SDK's {@link DockPanelProps}
 * — a {@link DockPanelApi} plus the panel's typed params. Also withdraws the
 * panel's Agent Session declaration and breadcrumb when it unmounts, so a
 * closed tab does not leave the host routing chrome at a tab that is gone.
 *
 * A kind that declares `toolbar` (RFC 0039) is framed: the host draws the
 * chrome strip above the component, the same one an editor gets, fed by
 * {@link DockPanelApi.setBreadcrumb} and `registerToolbarItem({ surface:
 * "panel" })`. A kind that omits `toolbar` gets today's bare frame.
 */
function toHostComponent(
  kind: DockPanelKind,
): FunctionComponent<IDockviewPanelProps> {
  const Component = kind.component as FunctionComponent<DockPanelProps>;
  const { toolbar } = kind;
  function DockPanelHost(props: IDockviewPanelProps) {
    const api = useMemo(() => makeDockPanelApi(props.api), [props.api]);
    const panelId = props.api.id;
    useEffect(
      () => () => {
        setPanelAgentSession(panelId, null);
        clearPanelBreadcrumb(panelId);
      },
      [panelId],
    );
    const params = props.params as Record<string, unknown>;
    // Each workspace has its own dock; this panel's chrome names the workspace
    // it lives in so a `surface: "panel"` toolbar item can act on it (RFC 0041)
    // — and the panel itself is told, so what it reports about itself is filed
    // where it lives rather than wherever the user is standing.
    //
    // A **recorded** panel answers this from its own record, which is true from
    // the first render; the dock's registration is the fallback, and is all a
    // transient panel (no record) has.
    const recorded = parseRecordedPanelId(panelId);
    const workspaceId =
      (recorded ? workspaceIdForPanelRecord(recorded.recordId) : null) ??
      dockApiWorkspaceId(props.containerApi) ??
      "";
    const onScreen = useDockPanelOnScreen(props.api, workspaceId);
    const body = createElement(Component, {
      api,
      params,
      workspaceId,
      onScreen,
    });
    if (!toolbar) return body;
    return createElement(
      "div",
      { className: "dock-panel-frame" },
      createElement(DockPanelChrome, {
        key: "chrome",
        panelId,
        kindId: kind.id,
        workspaceId,
        params,
        toolbar,
      }),
      createElement(
        "div",
        { className: "dock-panel-frame__body", key: "body" },
        body,
      ),
    );
  }
  DockPanelHost.displayName = `DockPanelHost(${kind.id})`;
  return DockPanelHost;
}

// Wrapper identity must be stable across `getDockComponents()` calls — dockview
// remounts a panel whose component reference changed, and the map is rebuilt
// every time a DockPanelKind registers or unregisters. Keyed by the kind's own
// component so re-registering the same kind object reuses its wrapper.
const hostComponentCache = new WeakMap<
  object,
  FunctionComponent<IDockviewPanelProps>
>();

function hostComponentFor(
  kind: DockPanelKind,
): FunctionComponent<IDockviewPanelProps> {
  const key = kind.component as unknown as object;
  let wrapped = hostComponentCache.get(key);
  if (!wrapped) {
    wrapped = toHostComponent(kind);
    hostComponentCache.set(key, wrapped);
  }
  return wrapped;
}

/**
 * Build the components map passed to dockview's <DockviewReact>. Called
 * lazily by CenterDock at first render (after extensions activate), so
 * dynamic registration at startup works; runtime additions after that
 * are not exposed to dockview without a rebuild.
 */
export function getDockComponents(): Record<
  string,
  FunctionComponent<IDockviewPanelProps>
> {
  const out: Record<string, FunctionComponent<IDockviewPanelProps>> = {};
  for (const kind of dockPanelKindRegistry.list()) {
    out[kind.id] = hostComponentFor(kind);
  }
  return out;
}
