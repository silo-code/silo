import type { ReactNode } from "react";
import { File as FileIcon } from "@phosphor-icons/react";
import type { FocusGroupItemProps } from "@silo-code/sdk";
import type { GitFileStatus } from "../git/git-api";
import {
  ICON_CHEV_DOWN,
  ICON_CHEV_RIGHT,
  ICON_OPEN,
  ICON_UNDO,
  ICON_PLUS,
  ICON_MINUS,
} from "./git-icons";

/** A bulk action shown in a section header (e.g. "Stage all", "Unstage all"). */
export type SectionAction = {
  icon: ReactNode;
  title: string;
  onClick: () => void;
};

export function Section({
  title,
  count,
  open,
  onToggle,
  actions,
  focusProps,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  actions?: SectionAction[];
  /**
   * Roving-focus props from the panel's `useFocusGroup` — the single-tab-stop
   * `tabIndex`, the arrow/Enter key handler (Enter toggles the section via the
   * group's `onActivate`), and the keyboard-ring markers. The header keeps its
   * own `onClick` for mouse toggling.
   */
  focusProps?: FocusGroupItemProps;
  children: React.ReactNode;
}) {
  return (
    <div className="git-section">
      {/* Not a <button>: it contains the header action buttons, and a button
          cannot nest a button. Use a div with button semantics instead. */}
      <div
        className="section-head"
        role="button"
        onClick={onToggle}
        {...focusProps}
      >
        <span className="section-chev">
          {open ? ICON_CHEV_DOWN : ICON_CHEV_RIGHT}
        </span>
        <span className="section-title">{title}</span>
        {actions && actions.length > 0 && (
          <span
            className="section-actions"
            onClick={(e) => e.stopPropagation()}
          >
            {actions.map((a) => (
              <button
                key={a.title}
                className="section-add"
                title={a.title}
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  a.onClick();
                }}
              >
                {a.icon}
              </button>
            ))}
          </span>
        )}
        <span className="section-count">{count}</span>
      </div>
      {open && <div className="section-body">{children}</div>}
    </div>
  );
}

function splitNameAndDir(path: string): { name: string; dir: string } {
  const idx = path.lastIndexOf("/");
  if (idx === -1) return { name: path, dir: "" };
  return { name: path.slice(idx + 1), dir: path.slice(0, idx) };
}

function statusGlyph(f: GitFileStatus): string {
  if (f.isUntracked) return "U";
  const flag = f.isStaged ? f.staged : f.worktree;
  switch (flag) {
    case "M":
      return "M";
    case "A":
      return "A";
    case "D":
      return "D";
    case "R":
      return "R";
    case "C":
      return "C";
    default:
      return "·";
  }
}

export function FileRow({
  file,
  kind,
  onRowClick,
  onOpen,
  onStage,
  onUnstage,
  onRevert,
  focusProps,
}: {
  file: GitFileStatus;
  folder: string;
  kind: "staged" | "changes";
  onRowClick: () => void;
  onOpen: () => void;
  onStage?: () => void;
  onUnstage?: () => void;
  onRevert?: () => void;
  /**
   * Roving-focus props from the panel's `useFocusGroup` — the single-tab-stop
   * `tabIndex`, the arrow/Enter key handler (Enter opens the diff via the group's
   * `onActivate`), and the keyboard-ring markers. The row keeps its own `onClick`
   * for mouse activation; the hover action buttons stay out of the Tab order.
   */
  focusProps?: FocusGroupItemProps;
}) {
  const { name, dir } = splitNameAndDir(file.path);
  const glyph = statusGlyph(file);
  return (
    <div
      className="git-file-row"
      onClick={onRowClick}
      title={file.path}
      {...focusProps}
    >
      <span className="ico file">
        <FileIcon size="1.3em" weight="regular" aria-hidden="true" />
      </span>
      <span className="file-name">{name}</span>
      {dir && <span className="file-dir">{dir}</span>}
      <span className="row-actions" onClick={(e) => e.stopPropagation()}>
        <button
          className="row-action"
          title="Open file"
          tabIndex={-1}
          onClick={onOpen}
        >
          {ICON_OPEN}
        </button>
        {kind === "changes" && onRevert && (
          <button
            className="row-action"
            title="Discard changes"
            tabIndex={-1}
            onClick={onRevert}
          >
            {ICON_UNDO}
          </button>
        )}
        {kind === "changes" && onStage && (
          <button
            className="row-action"
            title="Stage changes"
            tabIndex={-1}
            onClick={onStage}
          >
            {ICON_PLUS}
          </button>
        )}
        {kind === "staged" && onUnstage && (
          <button
            className="row-action"
            title="Unstage changes"
            tabIndex={-1}
            onClick={onUnstage}
          >
            {ICON_MINUS}
          </button>
        )}
      </span>
      <span className={`status-glyph status-${glyph}`}>{glyph}</span>
    </div>
  );
}
