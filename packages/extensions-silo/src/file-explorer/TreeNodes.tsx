import { useEffect, useRef, useState } from "react";
import {
  Folder,
  File as FileIcon,
  FilePlus,
  FolderPlus,
  ArrowClockwise,
  ArrowsIn,
} from "@phosphor-icons/react";
import { DND_MIME, Tooltip } from "@silo-code/sdk";
import {
  rowIndent,
  ROW_INDENT_PX,
  ROW_BASE_PX,
  CHEV_RIGHT,
  CHEV_DOWN,
  ICON_FOLDER_CLOSED,
  ICON_FOLDER_OPEN,
  ICON_FILE,
  type Listing,
  type RowSharedProps,
} from "./tree-types";

export function DirNode({
  dnd,
  getRowProps,
  path,
  name,
  depth,
  expanded,
  listings,
  onToggle,
  onOpenPermanent,
  isRoot = false,
  onContextMenu,
  renaming,
  onRenameCommit,
  onRenameCancel,
  newItem,
  onNewItem,
  onNewItemCommit,
  onNewItemCancel,
  selected,
  onDrop,
  rootActions,
}: {
  path: string;
  name: string;
  depth: number;
  expanded: Record<string, boolean>;
  listings: Record<string, Listing>;
  onToggle: (path: string, isDir: boolean) => void;
  isRoot?: boolean;
} & RowSharedProps) {
  const isExpanded = !!expanded[path];
  const listing = listings[path];
  const isHidden = name.startsWith(".");
  const isRenaming = !isRoot && renaming === path;
  const isSelected = !isRoot && selected === path;
  const showNewItem = newItem && newItem.dir === path && isExpanded;
  const [isDragOver, setIsDragOver] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  // Keep the latest drop callback without re-registering the listener each render.
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  // Roving focus / single-tab-stop / keyboard-ring props for this row (empty for
  // the root header, which isn't a focus item). Its `ref` is merged with the
  // drop-target ref below so the row keeps both.
  const focusProps = getRowProps(path, true);
  const focusRef = "ref" in focusProps ? focusProps.ref : undefined;
  const setRowRef = (el: HTMLDivElement | null) => {
    rowRef.current = el;
    focusRef?.(el);
  };

  function onDragStart(e: React.DragEvent<HTMLDivElement>) {
    if (isRoot) {
      e.preventDefault();
      return;
    }
    dnd.beginDrag(e, {
      items: [{ mime: DND_MIME.filePath, value: path }],
      label: name,
      effect: "move",
    });
  }

  // This row is a drop target: dropping a file here moves it into this dir.
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const reg = dnd.registerDropTarget(el, {
      accepts: [DND_MIME.filePath],
      onDragOver: () => {
        setIsDragOver(true);
        return "move";
      },
      onDragLeave: (e) => {
        // Ignore leaves into a descendant of the row.
        if (el.contains(e.relatedTarget as Node)) return;
        setIsDragOver(false);
      },
      onDrop: ({ items }) => {
        setIsDragOver(false);
        const dragged = items.find((i) => i.mime === DND_MIME.filePath)?.value;
        if (dragged) onDropRef.current(dragged, path);
        return true; // handled — don't fall through to the tree container
      },
    });
    return () => reg.dispose();
  }, [dnd, path]);

  return (
    <>
      <div
        {...focusProps}
        ref={setRowRef}
        className={`tree-row dir ${isHidden ? "hidden-entry" : ""} ${isRoot ? "root" : ""} ${isSelected ? "selected" : ""} ${isDragOver ? "drag-over" : ""}`}
        style={rowIndent(depth)}
        role="treeitem"
        aria-level={depth + 1}
        aria-expanded={isExpanded}
        aria-selected={isSelected || undefined}
        onClick={() => !isRenaming && onToggle(path, true)}
        onContextMenu={(e) => onContextMenu(e, path, true)}
        draggable={!isRoot && !isRenaming}
        onDragStart={onDragStart}
        title={path}
      >
        <span className="chev">{isExpanded ? CHEV_DOWN : CHEV_RIGHT}</span>
        {!isRoot && (isExpanded ? ICON_FOLDER_OPEN : ICON_FOLDER_CLOSED)}
        {isRenaming ? (
          <input
            className="rename-input"
            defaultValue={name}
            autoFocus
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            onBlur={(e) => onRenameCommit(path, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              } else if (e.key === "Escape") {
                e.preventDefault();
                onRenameCancel();
              } else {
                return;
              }
              // Keyboard end of rename: return focus to the row once the input
              // unmounts, instead of stranding focus on <body>. (Click-away
              // commits via onBlur and leaves focus where the click landed.)
              requestAnimationFrame(() => rowRef.current?.focus());
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="name">{isRoot ? name.toUpperCase() : name}</span>
        )}
        {isRoot && rootActions && (
          <span
            className="tree-root-actions"
            onClick={(e) => e.stopPropagation()}
          >
            <Tooltip content="New File">
              <button
                className="tree-hdr-btn"
                tabIndex={-1}
                onClick={rootActions.onNewFile}
              >
                <FilePlus size="1.2em" weight="regular" />
              </button>
            </Tooltip>
            <Tooltip content="New Folder">
              <button
                className="tree-hdr-btn"
                tabIndex={-1}
                onClick={rootActions.onNewFolder}
              >
                <FolderPlus size="1.2em" weight="regular" />
              </button>
            </Tooltip>
            <Tooltip content="Refresh">
              <button
                className="tree-hdr-btn"
                tabIndex={-1}
                onClick={rootActions.onRefresh}
              >
                <ArrowClockwise size="1.2em" weight="regular" />
              </button>
            </Tooltip>
            <Tooltip content="Collapse All">
              <button
                className="tree-hdr-btn"
                tabIndex={-1}
                onClick={rootActions.onCollapseAll}
              >
                <ArrowsIn size="1.2em" weight="regular" />
              </button>
            </Tooltip>
          </span>
        )}
      </div>
      {isExpanded && (
        <div className="children" role="group" style={{ position: "relative" }}>
          {/* Indent guide for this depth */}
          {!isRoot && (
            <span
              className="indent-guide"
              style={{ left: `${ROW_BASE_PX + depth * ROW_INDENT_PX + 6}px` }}
            />
          )}
          {listing?.error && (
            <div className="tree-row error" style={rowIndent(depth + 1)}>
              {listing.error}
            </div>
          )}
          {listing?.entries.map((entry) =>
            entry.isDir ? (
              <DirNode
                key={entry.path}
                dnd={dnd}
                getRowProps={getRowProps}
                path={entry.path}
                name={entry.name}
                depth={depth + 1}
                expanded={expanded}
                listings={listings}
                onToggle={onToggle}
                onOpenPermanent={onOpenPermanent}
                onContextMenu={onContextMenu}
                renaming={renaming}
                onRenameCommit={onRenameCommit}
                onRenameCancel={onRenameCancel}
                newItem={newItem}
                onNewItem={onNewItem}
                onNewItemCommit={onNewItemCommit}
                onNewItemCancel={onNewItemCancel}
                selected={selected}
                onDrop={onDrop}
              />
            ) : (
              <FileLeaf
                key={entry.path}
                dnd={dnd}
                getRowProps={getRowProps}
                path={entry.path}
                name={entry.name}
                depth={depth + 1}
                onOpen={onToggle}
                onOpenPermanent={onOpenPermanent}
                onContextMenu={onContextMenu}
                renaming={renaming}
                onRenameCommit={onRenameCommit}
                onRenameCancel={onRenameCancel}
                newItem={newItem}
                onNewItem={onNewItem}
                onNewItemCommit={onNewItemCommit}
                onNewItemCancel={onNewItemCancel}
                selected={selected}
                onDrop={onDrop}
              />
            ),
          )}
          {showNewItem && (
            <NewItemInput
              type={newItem.type}
              depth={depth + 1}
              onCommit={onNewItemCommit}
              onCancel={onNewItemCancel}
            />
          )}
        </div>
      )}
    </>
  );
}

export function FileLeaf({
  dnd,
  getRowProps,
  path,
  name,
  depth,
  onOpen,
  onOpenPermanent,
  onContextMenu,
  renaming,
  onRenameCommit,
  onRenameCancel,
  selected,
  onDrop,
}: {
  path: string;
  name: string;
  depth: number;
  onOpen: (path: string, isDir: boolean) => void;
} & RowSharedProps) {
  const isHidden = name.startsWith(".");
  const isRenaming = renaming === path;
  const isSelected = selected === path;
  const rowRef = useRef<HTMLDivElement>(null);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  const focusProps = getRowProps(path, false);
  const focusRef = "ref" in focusProps ? focusProps.ref : undefined;
  const setRowRef = (el: HTMLDivElement | null) => {
    rowRef.current = el;
    focusRef?.(el);
  };

  function onDragStart(e: React.DragEvent<HTMLDivElement>) {
    dnd.beginDrag(e, {
      items: [{ mime: DND_MIME.filePath, value: path }],
      label: name,
      effect: "move",
    });
  }

  // A file row is a drop target too — dropping onto it moves into its parent dir.
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const reg = dnd.registerDropTarget(el, {
      accepts: [DND_MIME.filePath],
      onDragOver: () => "move",
      onDrop: ({ items }) => {
        const dragged = items.find((i) => i.mime === DND_MIME.filePath)?.value;
        if (dragged) {
          const parentDir = path.substring(0, path.lastIndexOf("/"));
          onDropRef.current(dragged, parentDir);
        }
        return true;
      },
    });
    return () => reg.dispose();
  }, [dnd, path]);

  return (
    <div
      {...focusProps}
      ref={setRowRef}
      className={`tree-row file ${isHidden ? "hidden-entry" : ""} ${isSelected ? "selected" : ""}`}
      style={rowIndent(depth)}
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={isSelected || undefined}
      onClick={() => !isRenaming && onOpen(path, false)}
      onDoubleClick={() => !isRenaming && onOpenPermanent(path)}
      onContextMenu={(e) => onContextMenu(e, path, false)}
      draggable={!isRenaming}
      onDragStart={onDragStart}
      title={path}
    >
      <span className="chev" />
      {ICON_FILE}
      {isRenaming ? (
        <input
          className="rename-input"
          defaultValue={name}
          autoFocus
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          onBlur={(e) => onRenameCommit(path, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onRenameCancel();
            } else {
              return;
            }
            // Keyboard end of rename: return focus to the row once the input
            // unmounts, instead of stranding focus on <body>. (Click-away
            // commits via onBlur and leaves focus where the click landed.)
            requestAnimationFrame(() => rowRef.current?.focus());
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="name">{name}</span>
      )}
    </div>
  );
}

export function NewItemInput({
  type,
  depth,
  onCommit,
  onCancel,
}: {
  type: "file" | "folder";
  depth: number;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const Icon = type === "file" ? FileIcon : Folder;
  return (
    <div className="tree-row new-item-row" style={rowIndent(depth)}>
      <span className="chev" />
      <Icon size="1.2em" weight="regular" aria-hidden="true" className="ico" />
      <input
        className="new-item-input"
        autoFocus
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        onBlur={(e) => onCommit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
      />
    </div>
  );
}
