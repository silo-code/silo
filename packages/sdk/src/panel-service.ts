import type { Disposable } from "./types";
import type { TabAdornmentMethods } from "./tab-adornment";

// `ctx.panels` — tab chrome for a dock panel tab of any `DockPanelKind` (RFC
// 0046). The host implementation lives in the extension host.

/**
 * A snapshot of the active center-dock panel, when it's a `DockPanelKind`
 * other than the built-in editor or terminal. Returned by
 * {@link PanelService.getState} and delivered to
 * {@link PanelService.subscribe} listeners.
 *
 * @category Consumer Services
 * @public
 */
export interface ActivePanelInfo {
  /** The active tab's own dockview id — the same string {@link PanelService.focus}
   *  and the tab-adornment methods take as their target. */
  panelId: string;
  /** The panel's {@link DockPanelKind.id}. */
  kindId: string;
  /** The workspace whose dock this panel is active in. */
  workspaceId: string;
  /**
   * This tab's {@link DockPanelRecord.id}, when the kind is
   * `persistence: "recorded"` — the same id {@link Workspace.panels}
   * enumerates. `undefined` for a transient kind (no record exists to name).
   */
  recordId?: string;
}

/**
 * Tab-chrome verbs for a dock panel tab of any {@link DockPanelKind} — the
 * bundled Chat transcript, a web viewer, a third-party panel. Target id is
 * the panel's own dockview id — the same string a `"panel/tab"` context-menu
 * hit or a `"panel"` toolbar hit carries as `panelId`.
 *
 * Parallel to {@link EditorService} / {@link TerminalService}, which offer
 * the same {@link TabAdornmentMethods} scoped to their own kind — a panel tab
 * is a first-class third citizen for icon/highlight/indicator/activity
 * chrome, not a special case extensions have to work around.
 *
 * To enumerate a workspace's recorded panels rather than adorn one you were
 * already handed, read {@link Workspace.panels} and take each entry's
 * {@link DockPanelRecord.panelId} — that field is the id these methods want.
 * Don't compose it from {@link DockPanelRecord.id} and
 * {@link DockPanelRecord.kindId}: the format is host-owned and may change.
 *
 * @category Consumer Services
 * @public
 */
export interface PanelService extends TabAdornmentMethods {
  /**
   * Switch to the panel's owning workspace and bring its dock tab to the
   * front. No-op if `panelId` names no open panel.
   *
   * @example
   * ```ts
   * for (const p of workspace.panels) {
   *   if (p.id === flaggedRecordId) ctx.panels.focus(p.panelId);
   * }
   * ```
   */
  focus(panelId: string): void;

  /**
   * Current frozen snapshot of the active panel — `null` whenever the active
   * center-dock tab is the built-in editor or terminal, or nothing. Mirrors
   * {@link EditorService.getState}: referentially stable between renders, so
   * `useServiceState(ctx.panels)` works without extra memoization.
   *
   * A consumer that needs "is *this* flagged panel the one on screen"
   * compares `recordId` (or `panelId`) against its own records — e.g. each
   * entry's {@link DockPanelRecord.id} from {@link Workspace.panels}.
   *
   * @example
   * ```ts
   * const active = ctx.panels.getState();
   * if (active?.kindId === "silo.agents-chat-panel") {
   *   ctx.log.info(`Looking at panel ${active.panelId}`);
   * }
   * ```
   */
  getState(): ActivePanelInfo | null;

  /**
   * Subscribe to changes in the active panel. The listener is called whenever
   * {@link PanelService.getState}'s value changes (tab focus moves, workspace
   * switches, or the active tab becomes/stops being a non-editor/terminal
   * panel). Returns a {@link Disposable} that cancels the subscription.
   *
   * Use `useServiceState(ctx.panels)` in React components instead of calling
   * `subscribe` directly.
   */
  subscribe(listener: (state: ActivePanelInfo | null) => void): Disposable;
}
