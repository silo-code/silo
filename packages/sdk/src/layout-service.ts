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
  /**
   * Reveal a registered side panel by its {@link SidePanel.id}: make it the
   * active panel in its column and expand that column if collapsed. Use to bring
   * a panel to the foreground from a command or keybinding (e.g. "Find in Files"
   * focusing the Search panel). No-op if no panel with that id is registered.
   */
  revealSidePanel(id: string): void;
  /**
   * Open a new tab in the center dock for the given registered
   * {@link DockPanelKind}. Use this to programmatically open a custom panel
   * kind from a command (e.g. a "Web Viewer: Open" command that creates a new
   * web-viewer tab). No-op when the center dock has no active workspace.
   *
   * @param kindId - The {@link DockPanelKind.id} to instantiate.
   * @param params - Arbitrary params forwarded to the panel's
   *   `IDockviewPanelProps`. Serialized into `ws.dockLayout` so URL/state
   *   survives workspace close/reopen.
   */
  openPanel(kindId: string, params?: Record<string, unknown>): void;
  /**
   * Open a **singleton** dock panel — a panel that should only ever have one
   * instance at a time. If a panel with `kindId` already exists, focuses it;
   * otherwise creates it. The panel's id equals `kindId` (not UUID-based, so
   * at most one can exist). Use for utility panels like Output that don't
   * benefit from multiple instances.
   *
   * @param kindId - The {@link DockPanelKind.id} to open or focus.
   * @param params - Forwarded to the panel when creating; ignored when
   *   focusing an existing instance.
   */
  openSingletonPanel(kindId: string, params?: Record<string, unknown>): void;
}
