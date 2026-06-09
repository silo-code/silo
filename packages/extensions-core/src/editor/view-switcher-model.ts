import type { EditorViewInfo } from "@silo-code/sdk";

// The view-switcher's presentation decision, factored out of the component so
// the rules (when to show, which control, what's current) are unit-testable.

export interface ViewSwitcherModel {
  /** Segmented toggle for exactly two views; dropdown for three or more. */
  mode: "segmented" | "dropdown";
  /** The currently-shown view's id. */
  currentId: string;
  /** The matching views, highest-priority first. */
  views: EditorViewInfo[];
}

/**
 * Decide how (or whether) to render the view-switcher. Returns `null` when there
 * is no switcher to show: diffs, untitled buffers, or files with a single view.
 */
export function viewSwitcherModel(opts: {
  views: EditorViewInfo[];
  viewType: string | null;
  filePath: string | null;
  isDiff: boolean;
}): ViewSwitcherModel | null {
  const { views, viewType, filePath, isDiff } = opts;
  // No alternate views for diffs or unsaved buffers.
  if (isDiff || filePath === null) return null;
  // Nothing to switch between.
  if (views.length <= 1) return null;
  const currentId =
    viewType ?? views.find((v) => v.isDefault)?.id ?? views[0].id;
  return {
    mode: views.length === 2 ? "segmented" : "dropdown",
    currentId,
    views,
  };
}
