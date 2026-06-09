import type { ReactNode } from "react";
import type { DndService, FocusGroupItemProps } from "@silo-code/sdk";
import {
  CaretRight,
  CaretDown,
  Folder,
  FolderOpen,
  File as FileIcon,
} from "@phosphor-icons/react";
import type { FileMeta } from "@silo-code/sdk";

export type Listing = { entries: FileMeta[]; error?: string };

/** "new item" state: pending creation at a directory with a given type. */
export interface NewItem {
  dir: string;
  type: "file" | "folder";
}

export function dirOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx <= 0 ? "/" : path.slice(0, idx);
}

export function rootName(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}

// ── row layout ───────────────────────────────────────────────────────────
export const ROW_INDENT_PX = 14;
export const ROW_BASE_PX = 6;

export function rowIndent(depth: number) {
  return { paddingLeft: `${ROW_BASE_PX + depth * ROW_INDENT_PX}px` };
}

// ── shared icons ─────────────────────────────────────────────────────────
export const CHEV_RIGHT: ReactNode = (
  <CaretRight size="1.15em" weight="bold" aria-hidden="true" />
);
export const CHEV_DOWN: ReactNode = (
  <CaretDown size="1.15em" weight="bold" aria-hidden="true" />
);
export const ICON_FOLDER_CLOSED: ReactNode = (
  <Folder
    size="1.3em"
    weight="regular"
    aria-hidden="true"
    className="ico folder"
  />
);
export const ICON_FOLDER_OPEN: ReactNode = (
  <FolderOpen
    size="1.3em"
    weight="regular"
    aria-hidden="true"
    className="ico folder open"
  />
);
export const ICON_FILE: ReactNode = (
  <FileIcon
    size="1.3em"
    weight="regular"
    aria-hidden="true"
    className="ico file"
  />
);

/**
 * The focus-group props a focusable row spreads onto its element — the roving
 * tab stop, the key/focus handlers, and the keyboard-ring markers. Empty for
 * rows that aren't focus items (the root header), so the spread is a no-op.
 */
export type RowFocusProps = FocusGroupItemProps | Record<string, never>;

/** Props every tree row (dir or file) shares — threaded down from `Tree`. */
export interface RowSharedProps {
  /** The drag-and-drop primitive, for drag sources + drop targets. */
  dnd: DndService;
  /**
   * Focus-group props for the row at `path` (roving tab stop, arrow/Enter/menu
   * handlers, keyboard ring). Returns `{}` for the root header and any path not
   * in the visible flat list, so the spread is harmless.
   */
  getRowProps: (path: string, isDir: boolean) => RowFocusProps;
  onContextMenu: (e: React.MouseEvent, path: string, isDir: boolean) => void;
  onOpenPermanent: (path: string) => void;
  renaming: string | null;
  onRenameCommit: (path: string, newName: string) => void;
  onRenameCancel: () => void;
  newItem: NewItem | null;
  onNewItem: (item: NewItem) => void;
  onNewItemCommit: (name: string) => void;
  onNewItemCancel: () => void;
  selected: string | null;
  onDrop: (draggedPath: string, targetDir: string) => void;
  rootActions?: {
    onNewFile: () => void;
    onNewFolder: () => void;
    onRefresh: () => void;
    onCollapseAll: () => void;
  };
}
