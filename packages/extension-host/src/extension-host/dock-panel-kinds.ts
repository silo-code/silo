import {
  createElement,
  useEffect,
  useMemo,
  type FunctionComponent,
} from "react";
import type { IDockviewPanelProps } from "dockview";
import { Registry } from "./registry";
import { tabAdornmentRegistry } from "./tab-adornment-registry";
import type {
  DockPanelApi,
  DockPanelKind,
  DockPanelProps,
  TabActivityContribution,
  TabIconContribution,
} from "@silo-code/sdk";

export const dockPanelKindRegistry = new Registry<DockPanelKind>();

/**
 * The single leading-icon / trailing-activity adornment a dock panel drives on
 * its *own* tab through {@link DockPanelApi.setTabIcon} /
 * {@link DockPanelApi.setTabActivity}. Fixed id because there is exactly one
 * per panel — the panel is not stacking contributions, it is reflecting its
 * own state.
 */
const PANEL_SELF_ADORNMENT_ID = "silo.dock-panel.self";

type DockviewPanelApi = IDockviewPanelProps["api"];

/**
 * Adapt a dockview panel api into the SDK's {@link DockPanelApi}. Most members
 * are a straight delegation — the two surfaces were deliberately kept
 * structurally compatible — but `setTabActivity` / `setTabIcon` are Silo's
 * own: they record into the tab-adornment registry under the `"panel"` kind,
 * keyed by this panel's dockview id, which is what `DockTab` reads back
 * (RFC 0038 Session 3.1).
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
    setTabActivity: (adornment: TabActivityContribution | null) => {
      if (adornment) {
        tabAdornmentRegistry.setActivity("panel", dv.id, {
          id: PANEL_SELF_ADORNMENT_ID,
          ...adornment,
        });
      } else {
        tabAdornmentRegistry.clearActivity(
          "panel",
          dv.id,
          PANEL_SELF_ADORNMENT_ID,
        );
      }
    },
    setTabIcon: (adornment: TabIconContribution | null) => {
      if (adornment) {
        tabAdornmentRegistry.setIcon("panel", dv.id, {
          id: PANEL_SELF_ADORNMENT_ID,
          ...adornment,
        });
      } else {
        tabAdornmentRegistry.clearIcon("panel", dv.id, PANEL_SELF_ADORNMENT_ID);
      }
    },
  };
}

/**
 * Wrap a {@link DockPanelKind.component} so dockview (which passes
 * {@link IDockviewPanelProps}) mounts it with the SDK's {@link DockPanelProps}
 * — a {@link DockPanelApi} plus the panel's typed params. Also clears the
 * panel's own tab adornments when it unmounts, so a closed Chat tab does not
 * leave a stale badge in the registry.
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
        tabAdornmentRegistry.clearActivity(
          "panel",
          panelId,
          PANEL_SELF_ADORNMENT_ID,
        );
        tabAdornmentRegistry.clearIcon(
          "panel",
          panelId,
          PANEL_SELF_ADORNMENT_ID,
        );
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
