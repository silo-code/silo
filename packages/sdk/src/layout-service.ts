import type { ReactNode } from "react";
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
 * Options for {@link LayoutService.openPanelSheet}.
 *
 * @category Consumer Services
 * @public
 */
export interface SheetOptions {
  /** Header rendered at the top of the sheet; omit for a bare surface. */
  title?: ReactNode;
  /** Width in CSS px. Omit for the default (~520px). */
  width?: number;
  /**
   * Skip the sheet's own header and body padding — your content *is* the
   * surface, and owns its own chrome (including a close affordance).
   */
  bare?: boolean;
  /** Extra class on the sheet surface. */
  className?: string;
  /** Accessible name for a sheet without a visible {@link SheetOptions.title}. */
  ariaLabel?: string;
  /**
   * `"overlay"` covers the center dock, `"push"` narrows it so the sheet
   * takes real layout space. Default `"overlay"`.
   */
  mode?: "overlay" | "push";
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
   * Open a host-owned sheet that grows out of the side dock currently hosting
   * `panelId` — reveals that panel first (the same unhide + activate-tab +
   * expand-column work {@link LayoutService.revealSidePanel} does), then
   * slides a sheet out from its side. Never modal: no scrim, `Escape` does
   * nothing, the rest of the workbench stays live and interactive.
   *
   * Like {@link LayoutService.revealSidePanel}, `panelId` isn't restricted to
   * a panel the calling extension itself registered — a status-bar button or
   * command from one extension can open a companion sheet for another's panel.
   *
   * Supply a `render` callback that receives a `close` function and returns
   * the sheet's content; the returned promise resolves (with no value) once
   * the sheet closes. Rejects if `panelId` names no registered
   * {@link SidePanel}.
   *
   * @param panelId - The {@link SidePanel.id} to anchor and reveal.
   * @param render - Returns the sheet's content; receives `close` to settle it.
   * @param opts - Presentation options — see {@link SheetOptions}.
   *
   * @example
   * ```tsx
   * void ctx.layout.openPanelSheet(
   *   "skills",
   *   (close) => <BrowseBody onClose={close} />,
   *   { title: <BrandMark />, width: 560 },
   * );
   * ```
   */
  openPanelSheet(
    panelId: string,
    render: (close: () => void) => ReactNode,
    opts?: SheetOptions,
  ): Promise<void>;
  /**
   * Open a new tab in the center dock for the given registered
   * {@link DockPanelKind}. Use this to programmatically open a custom panel
   * kind from a command (e.g. a "Web Viewer: Open" command that creates a new
   * web-viewer tab). No-op when the center dock has no active workspace.
   *
   * @param kindId - The {@link DockPanelKind.id} to instantiate.
   * @param params - Arbitrary params forwarded to the panel component.
   *   Serialized into `ws.dockLayout` so state survives workspace
   *   close/reopen.
   * @param options - `singleton: true` opens at most one instance at a time:
   *   if a panel with `kindId` already exists, it is focused instead of
   *   creating a new one — `params` is still shallow-merged into that
   *   existing panel first, so a later call can retarget it (e.g. switching
   *   which channel the Output panel shows). The panel's id equals `kindId`
   *   (not UUID-based) when singleton is set.
   */
  openPanel(
    kindId: string,
    params?: Record<string, unknown>,
    options?: { singleton?: boolean },
  ): void;
  /**
   * Open a **singleton** dock panel.
   * @deprecated Use `openPanel(kindId, params, { singleton: true })` instead.
   *   This method will be removed in a future release.
   */
  openSingletonPanel(kindId: string, params?: Record<string, unknown>): void;
}
