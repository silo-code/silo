import type { FunctionComponent } from "react";
import type { IDockviewPanelProps } from "dockview";
import { Registry } from "./registry";
import type { DockPanelKind } from "@silo-code/sdk";

export const dockPanelKindRegistry = new Registry<DockPanelKind>();

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
    out[kind.id] =
      kind.component as unknown as FunctionComponent<IDockviewPanelProps>;
  }
  return out;
}
