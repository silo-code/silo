import {
  createElement,
  useEffect,
  useMemo,
  type FunctionComponent,
} from "react";
import type { IDockviewPanelProps } from "dockview";
import { Registry } from "./registry";
import { setPanelAgentSession } from "./agents/agent-surface-registry";
import type {
  DockPanelApi,
  DockPanelKind,
  DockPanelProps,
} from "@silo-code/sdk";

export const dockPanelKindRegistry = new Registry<DockPanelKind>();

type DockviewPanelApi = IDockviewPanelProps["api"];

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
    updateParameters: (params) =>
      dv.updateParameters(params as Record<string, unknown>),
    setAgentSession: (agentSessionId: string | null) => {
      setPanelAgentSession(dv.id, agentSessionId, {
        // Closing the panel is what `ctx.agents.close(id)` means for a session
        // with no PTY: the transcript goes away and the panel's own unmount
        // reaps the agent process, exactly as closing a terminal tab kills its
        // child.
        close: () => dv.close(),
      });
    },
  };
}

/**
 * Wrap a {@link DockPanelKind.component} so dockview (which passes
 * {@link IDockviewPanelProps}) mounts it with the SDK's {@link DockPanelProps}
 * — a {@link DockPanelApi} plus the panel's typed params. Also withdraws the
 * panel's Agent Session declaration when it unmounts, so a closed Chat tab
 * does not leave the host routing agent chrome at a tab that is gone.
 */
function toHostComponent(
  kind: DockPanelKind,
): FunctionComponent<IDockviewPanelProps> {
  const Component = kind.component as FunctionComponent<DockPanelProps>;
  function DockPanelHost(props: IDockviewPanelProps) {
    const api = useMemo(() => makeDockPanelApi(props.api), [props.api]);
    const panelId = props.api.id;
    useEffect(
      () => () => {
        setPanelAgentSession(panelId, null);
      },
      [panelId],
    );
    return createElement(Component, {
      api,
      params: props.params as Record<string, unknown>,
    });
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
