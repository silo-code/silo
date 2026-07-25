// Pure rules for the full-panel "View Commits" takeover (GitExplorerPanel +
// CommitsTakeover). Kept separate from the components so the open/close/pane
// rules are unit-testable without rendering React.
import type { PanelView } from "./view-stack";

/** "View Commits" only needs to push a fresh `commits` view when the repo's
 * own stack is at root — reopening a repo that was left mid-drill (persisted
 * per-repo) should resume exactly where it was, not restart the list. */
export function shouldPushCommitsOnOpen(view: PanelView): boolean {
  return view.kind === "root";
}

/** The takeover auto-closes once its repo's stack pops back to root — covers
 * the Back button, Escape, and any other path that empties the stack. */
export function shouldExitTakeover(
  isActive: boolean,
  view: PanelView,
): boolean {
  return isActive && view.kind === "root";
}

export type PaneSlot = "current" | "parked-left" | "parked-right";

/** The commit list is the shallow pane: centered unless a commit detail has
 * been pushed on top of it, in which case it parks off-screen left (the
 * "back" direction) while detail slides in from the right. */
export function listPaneSlot(view: PanelView): PaneSlot {
  return view.kind === "commit-detail" ? "parked-left" : "current";
}

/** Mirror of `listPaneSlot`: detail is centered only while it's the current
 * view; otherwise it parks off-screen right, ready to slide back in. */
export function detailPaneSlot(view: PanelView): PaneSlot {
  return view.kind === "commit-detail" ? "current" : "parked-right";
}
