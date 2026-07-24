// Pure, serializable navigation stack for the git panel's internal
// list → commit-detail drill-down (the "View Commits" flow). Modeled on the
// list/detail view-stack pattern used by the (external) github-prs extension:
// a plain union + push/pop, persisted to the panel's storage bag so a reload
// restores where the user left off.

/** One "page" the git panel can show, in place of its normal root content. */
export type PanelView =
  | { kind: "root" }
  | { kind: "commits" }
  | { kind: "commit-detail"; hash: string };

export const ROOT_VIEW: PanelView = { kind: "root" };

export interface ViewStack {
  /** Root first, current view last. Never empty. */
  views: PanelView[];
}

export const INITIAL_STACK: ViewStack = { views: [ROOT_VIEW] };

export function currentView(stack: ViewStack): PanelView {
  return stack.views[stack.views.length - 1] ?? ROOT_VIEW;
}

export function pushView(stack: ViewStack, view: PanelView): ViewStack {
  return { views: [...stack.views, view] };
}

/** No-op at the root — the root can't be popped. */
export function popView(stack: ViewStack): ViewStack {
  if (stack.views.length <= 1) return stack;
  return { views: stack.views.slice(0, -1) };
}

function isPanelView(v: unknown): v is PanelView {
  if (typeof v !== "object" || v === null || !("kind" in v)) return false;
  const kind = (v as { kind: unknown }).kind;
  if (kind === "root" || kind === "commits") return true;
  return (
    kind === "commit-detail" &&
    typeof (v as { hash?: unknown }).hash === "string"
  );
}

export function serializeStack(stack: ViewStack): unknown {
  return stack.views;
}

/** Restore a stack from storage, discarding anything malformed rather than
 * trusting a corrupted/foreign value — worst case, it falls back to root. */
export function restoreStack(raw: unknown): ViewStack {
  if (!Array.isArray(raw)) return INITIAL_STACK;
  const views = raw.filter(isPanelView);
  return views.length > 0 ? { views } : INITIAL_STACK;
}
