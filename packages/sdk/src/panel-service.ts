import type { TabAdornmentMethods } from "./tab-adornment";

// `ctx.panels` — tab chrome for a dock panel tab of any `DockPanelKind` (RFC
// 0046). The host implementation lives in the extension host.

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
export interface PanelService extends TabAdornmentMethods {}
