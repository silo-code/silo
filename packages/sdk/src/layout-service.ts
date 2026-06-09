import type { Disposable } from "./types";

/**
 * Which side column a layout operation targets.
 *
 * @category Consumer Services
 * @public
 */
export type SideLocation = "left" | "right";

/**
 * Collapse state for one side column.
 *
 * @category Consumer Services
 * @public
 */
export interface SidePanelColumnState {
  /** True when the column is collapsed (hidden). */
  collapsed: boolean;
}

/**
 * An immutable view of side-column layout state.
 *
 * @category Consumer Services
 * @public
 */
export interface LayoutState {
  left: SidePanelColumnState;
  right: SidePanelColumnState;
}

/**
 * Consumer API for app layout, exposed as {@link ExtensionContext.layout}.
 * Read side-panel collapse state and drive it.
 *
 * @category Consumer Services
 * @public
 */
export interface LayoutService {
  /** Current frozen layout state. */
  getState(): LayoutState;
  /** Subscribe to layout changes; dispose to stop. */
  subscribe(listener: (s: LayoutState) => void): Disposable;
  /** Toggle a side column between collapsed and expanded. */
  toggleSidePanel(location: SideLocation): void;
  /** Set a side column's collapsed state explicitly. */
  setSidePanelCollapsed(location: SideLocation, collapsed: boolean): void;
}
