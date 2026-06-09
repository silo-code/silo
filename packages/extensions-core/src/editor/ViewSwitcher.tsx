import type { MouseEvent } from "react";
import type { ExtensionContext } from "@silo-code/sdk";
import { viewSwitcherModel } from "./view-switcher-model";
import "./ViewSwitcher.css";

interface Props {
  ctx: ExtensionContext;
  workspaceId: string | undefined;
  editorId: string;
  filePath: string | null;
  viewType: string | null;
  isDiff: boolean;
}

/**
 * The view-switcher pinned to the far right of the breadcrumb bar. For exactly
 * two views it's a segmented toggle (both labels shown, click the inactive one
 * to switch in a single click); for three or more it's a dropdown. Hidden when
 * there's no choice (one matching editor), for diffs, and for untitled buffers.
 */
export function ViewSwitcher({
  ctx,
  workspaceId,
  editorId,
  filePath,
  viewType,
  isDiff,
}: Props) {
  // `viewSwitcherModel` returns null for diffs / untitled / single-view, so we
  // don't need to pre-guard the editorsFor call.
  const model = viewSwitcherModel({
    views: ctx.editors.editorsFor(filePath),
    viewType,
    filePath,
    isDiff,
  });
  if (!model) return null;
  const { views, currentId } = model;

  const switchTo = (id: string) => {
    if (id !== currentId)
      ctx.editors.setViewType(editorId, id, { workspaceId });
  };

  // Two views → segmented toggle (one click to switch).
  if (model.mode === "segmented") {
    return (
      <div className="view-switcher-seg" role="group" aria-label="Switch view">
        {views.map((v) => (
          <button
            key={v.id}
            type="button"
            className="view-switcher-seg__btn"
            // Out of the keyboard Tab order: the center is entered at its content
            // (editor cursor / preview view), and this chrome is mouse-driven, so
            // Tab through the view doesn't stop on the switcher.
            tabIndex={-1}
            aria-pressed={v.id === currentId}
            onClick={() => switchTo(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>
    );
  }

  // Three or more → dropdown.
  const currentLabel =
    views.find((v) => v.id === currentId)?.label ?? currentId;
  const openMenu = (e: MouseEvent<HTMLButtonElement>) => {
    const anchor = e.currentTarget;
    void ctx.ui.showMenu({
      anchor,
      align: "end",
      items: views.map((v) => ({
        label: v.label,
        checked: v.id === currentId,
        run: () => switchTo(v.id),
      })),
    });
  };

  return (
    <button
      type="button"
      className="view-switcher"
      title="Switch view"
      tabIndex={-1}
      onClick={openMenu}
    >
      <span className="view-switcher__label">{currentLabel}</span>
      <svg
        className="view-switcher__caret"
        width="12"
        height="12"
        viewBox="0 0 16 16"
        aria-hidden="true"
      >
        <path
          d="M4 6l4 4 4-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
