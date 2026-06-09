import type { DockviewApi } from "dockview";
import { cycleSidePaneTab } from "../layout/side-pane-registry";
import { retryFocus } from "../extension-host/use-focus-retry";
import { TABBABLE, focusFirstOrContainer } from "../extension-host/focus-dom";

let activeApi: DockviewApi | null = null;

// Monotonic "focus intent" counter. Every region/group/tab focus bumps it; the
// center dock's async retry (focusContentIn) captures the current value and
// bails the moment it changes. Without this, a still-running center retry yanks
// focus back from the area the user just cycled to — focus intermittently
// "skips" the side dock when chording quickly through the center.
let focusGen = 0;

export function setActiveDockApi(api: DockviewApi | null) {
  activeApi = api;
}

export function closeActivePanel(): boolean {
  const panel = activeApi?.activePanel;
  if (!panel) return false;
  panel.api.close();
  return true;
}

/**
 * Bump the focus-intent token so any in-flight center retry ({@link
 * focusContentIn}) bails on its next frame. The focus-region model calls this
 * when focus moves into a non-center region by any path (region cycle, Tab
 * handoff, click-to-enter), so a lingering center retry can't yank focus back.
 */
export function supersedeCenterRetry(): void {
  focusGen += 1;
}

/**
 * Move the active tab one step within its strip (the active dockview group),
 * wrapping at the ends. Cycles whatever tabs share that strip — editors,
 * terminals, or a mix — so "next/previous tab" matches what the user sees in
 * the focused tab bar. Returns false when there's no active dock/group or fewer
 * than two tabs to cycle.
 */
export function cycleActiveGroupPanel(dir: 1 | -1): boolean {
  focusGen += 1; // new focus intent — supersede any in-flight center retry
  const group = activeApi?.activeGroup;
  if (!group) return false;
  const panels = group.panels;
  if (panels.length < 2) return false;
  const active = group.activePanel;
  const idx = active ? panels.indexOf(active) : -1;
  const next = (idx + dir + panels.length) % panels.length;
  panels[next].api.setActive();
  // Same gotcha as cycleActiveGroup: `setActive()` switches the visible tab but
  // doesn't move DOM focus to it, so the previously-focused editor blurs and
  // focus falls out of the dock — the focus-driven active-tab accent would
  // blink out "for good". Drive focus into the (unchanged) active group's new
  // content so focus follows the tab, exactly as a tab click would.
  focusContentIn(group.element);
  return true;
}

/**
 * Move focus to the next/previous split group within the active dock, wrapping
 * at the ends. Activates the target group's active tab so focus and the
 * active-group highlight follow (falling back to focusing an empty group).
 * Returns false when there's no active dock or fewer than two groups to cycle.
 */
export function cycleActiveGroup(dir: 1 | -1): boolean {
  focusGen += 1; // new focus intent — supersede any in-flight center retry
  const api = activeApi;
  if (!api) return false;
  const groups = api.groups;
  if (groups.length < 2) return false;
  const current = api.activeGroup;
  const idx = current ? groups.indexOf(current) : -1;
  const next = groups[(idx + dir + groups.length) % groups.length];
  if (next.activePanel) next.activePanel.api.setActive();
  else next.focus();
  // `setActive()`/`group.focus()` move dockview's active-group highlight but do
  // NOT reliably land DOM focus inside the target group (dockview's
  // `panel.focus()` no-ops once the panel is already its group's active one, so
  // only the highlight moves while focus stays — then blurs — in the old
  // group). Drive focus into the target group's content so keyboard
  // group-switching matches a tab click: focus follows the active group, which
  // is also what the focus-driven active-tab accent border keys off.
  focusContentIn(next.element);
  return true;
}

// ── center focus ───────────────────────────────────────────────────────────
// The center dock's focus target is the active dockview panel's content. This
// machinery (the focusGen retry-cancel token + retryFocus) is the genuinely
// subtle part of cross-region focus, kept isolated here; the focus-region model
// (focus-regions.ts) drives the center region's entry through `focusCenterDock`.

/**
 * Focus the active center panel's content directly. dockview's
 * `panel.focus()` is a no-op once the panel is already the active one (only DOM
 * focus left the dock), so we target the visible editor/terminal textarea — the
 * inactive tabs' textareas are hidden (`offsetParent == null`), so the first
 * visible one belongs to the active panel. Falls back to any focusable, then
 * the host itself for an empty dock.
 */
function focusCenterContent(host: HTMLElement): boolean {
  // Scope to the active panel's content area (dockview shows the active panel in
  // `.dv-content-container`, inactive ones hidden), so a no-cursor view — a
  // markdown preview, a diff, a custom editor — lands on its own content (where
  // arrows scroll and Tab cycles its links) instead of the tab-bar chrome above
  // it (tab headers, the view switcher, the group-add button).
  const content =
    host.querySelector<HTMLElement>(".dv-content-container") ?? host;
  for (const ta of content.querySelectorAll<HTMLTextAreaElement>("textarea")) {
    if (ta.offsetParent !== null) {
      ta.focus();
      return true;
    }
  }
  return focusFirstOrContainer(content);
}

/**
 * Drive DOM focus into `host`'s active content ({@link focusCenterContent}),
 * retrying across frames to win dockview's layout/focus shuffle. Shared by every
 * caller that activates a dock target whose `setActive()`/`panel.focus()` moves
 * the highlight but not DOM focus — region focus and the keyboard group/tab
 * cyclers — so focus (and the focus-driven active-tab accent) follows the
 * highlight instead of falling out of the dock.
 */
function focusContentIn(host: HTMLElement): void {
  // Snapshot the focus intent; bail if a newer region/group/tab focus supersedes
  // us, so this center retry can't steal focus back from where the user moved.
  const gen = focusGen;
  retryFocus(
    () => focusCenterContent(host),
    () => host.contains(document.activeElement),
    () => focusGen === gen,
  );
}

/**
 * The element the center's entry focus should land in: the **active dockview
 * group**, so returning to the center (via the region cycle or the Tab handoff)
 * restores the same tab — editor or terminal — you left from. dockview keeps
 * `activeGroup` across a focus excursion to another region, so it's the group you
 * were last in. Scoping to it (rather than the whole dock-host) is what fixes
 * "left from the editor, came back on the terminal": a split's always-visible
 * xterm textarea no longer wins over the group you actually left.
 *
 * Falls back to the active group within the active dock-host by DOM, then the
 * dock-host itself; null when there's no active center dock.
 */
export function activeCenterTarget(): HTMLElement | null {
  const group = activeApi?.activeGroup?.element;
  if (group) return group;
  const dockHost = document.querySelector<HTMLElement>(
    '.center-body .dock-host[data-active="true"]',
  );
  if (!dockHost) return null;
  return (
    dockHost.querySelector<HTMLElement>(".dv-groupview.dv-active-group") ??
    dockHost
  );
}

/**
 * Focus the center dock's active content (the editor/terminal cursor) — the
 * center region's entry point, used by the region cycle and the Tab handoff.
 * Returns false when the center has nothing to land on (no active dock host or
 * an empty one), so the region model skips it instead of trapping focus on dead
 * chrome.
 */
export function focusCenterDock(): boolean {
  const host = activeCenterTarget();
  if (!host) return false;
  // Nothing to land on (no editor/terminal/focusable) → let focus flow normally.
  if (!host.querySelector(`textarea, ${TABBABLE}`)) return false;
  focusGen += 1;
  focusContentIn(host);
  return true;
}

/**
 * Test-driver: move the active center panel into a new split group beside its
 * current one, so automation can set up a multi-group center (e.g. an editor +
 * terminal split) — the scenario {@link activeCenterTarget}'s active-group
 * scoping (center re-entry focus restore) exists for. Returns the resulting
 * group count (0 when there's no active panel).
 */
export function splitActivePanel(
  position: "left" | "right" | "top" | "bottom" = "right",
): number {
  const panel = activeApi?.activePanel;
  if (!activeApi || !panel) return 0;
  panel.api.moveTo({ position });
  return activeApi.groups.length;
}

/** The side slot ("left", "left-bottom", …) that currently holds focus. */
function focusedSideSlot(): string | null {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) return null;
  return el.closest<HTMLElement>(".side-pane[data-slot]")?.dataset.slot ?? null;
}

/**
 * Cycle tabs in whichever area has focus: the focused side pane's tabs when a
 * side dock holds focus, otherwise the center dock's tab strip. This is what
 * Cmd+Alt+←/→ binds to, so the same chord follows the keyboard.
 */
export function cycleTabInFocusedArea(dir: 1 | -1): boolean {
  const slot = focusedSideSlot();
  if (slot) return cycleSidePaneTab(slot, dir);
  return cycleActiveGroupPanel(dir);
}
