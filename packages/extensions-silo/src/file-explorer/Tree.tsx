import { useEffect, useMemo, useRef, useState } from "react";
import {
  DND_MIME,
  useFocusGroup,
  type ExtensionContext,
  type MenuEntry,
} from "@silo-code/sdk";
import {
  dirOf,
  type Listing,
  type NewItem,
  type RowFocusProps,
} from "./tree-types";
import {
  collapseAllExpanded,
  flattenVisible,
  matchRowShortcut,
  rowAccelerators,
  treeArrowNav,
} from "./tree-nav";
import { DirNode } from "./TreeNodes";
import type { GitAPI, GitWorktree } from "../git/git-api";
import { findWorktreeFor } from "../git/worktree-utils";

// Module-level file clipboard (cut/copy) — reserved for future Paste implementation
const fileCb = { current: null as { path: string; op: "cut" | "copy" } | null };

// Sync platform read, mirroring how the host itself decides (keymap.ts): the
// row chords need an answer inside a keydown handler, and `ctx.system.getInfo()`
// is async.
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const isWindows = /Win/.test(navigator.platform);
const ACCEL = rowAccelerators(isMac);
// Name the OS file manager the way that platform names it — "Reveal in Finder"
// is meaningless on Windows.
const REVEAL_LABEL = isMac
  ? "Reveal in Finder"
  : isWindows
    ? "Reveal in File Explorer"
    : "Reveal in File Manager";

export function Tree({
  ctx,
  workspaceId,
  root,
  rootLabel,
  initialExpanded,
  persistExpanded,
  initialSelected,
  persistSelected,
}: {
  ctx: ExtensionContext;
  workspaceId: string;
  root: string;
  rootLabel: string;
  initialExpanded?: Record<string, boolean>;
  /** Persist the expanded-paths map (merged into the panel's stored state). */
  persistExpanded: (expanded: Record<string, boolean>) => void;
  initialSelected?: string | null;
  persistSelected?: (path: string | null) => void;
}) {
  // The public primitives this tree drives — read through ctx, never the host
  // getters. (Stable per extension, so safe to bind once per render.)
  const editors = ctx.editors;
  const files = ctx.files;
  const [listings, setListings] = useState<Record<string, Listing>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => ({
    ...(initialExpanded ?? { [root]: true }),
  }));
  // Mirror of `expanded` for the fs-watch callback, which closes over state but
  // must not re-subscribe the OS watcher on every expand/collapse. Kept current
  // each render so change events reload only the folders that are open now.
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const loadingRef = useRef<Set<string>>(new Set());
  const fileTreeRef = useRef<HTMLDivElement>(null);
  const [newItem, setNewItem] = useState<NewItem | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(
    () => initialSelected ?? null,
  );
  // Path whose row should take keyboard focus once it (re)appears in the
  // flattened list — set after a rename commits. The renamed row unmounts and
  // remounts under its new path when the fs-watch reload refreshes the
  // listing, which would otherwise strand DOM focus (or leave it wherever the
  // browser default-focuses on node removal) instead of following the file.
  const pendingFocusPath = useRef<string | null>(null);
  // Whether `root` is itself a linked git worktree — drives the header badge
  // (mirrors the Git panel's; consumes `silo.git` directly, same as
  // git-explorer does, rather than reaching into that extension's internals).
  const [worktrees, setWorktrees] = useState<GitWorktree[] | null>(null);
  useEffect(() => {
    setWorktrees(null);
    const api = ctx.getExtension<GitAPI>("silo.git")?.api;
    if (!api) return;
    api
      .worktrees(root)
      .then(setWorktrees)
      .catch(() => undefined);
  }, [ctx, root]);
  const linkedWorktree = worktrees
    ? findWorktreeFor(root, worktrees)
    : undefined;
  const isWorktree = !!linkedWorktree && !linkedWorktree.isMain;

  function selectPath(path: string | null) {
    setSelected(path);
    persistSelected?.(path);
  }

  // The visible rows in document order — the index space useFocusGroup roves
  // over. Built from listings/expanded so it tracks expand/collapse, and ordered
  // exactly as TreeNodes renders so arrow movement lands on the adjacent row.
  const flat = useMemo(
    () => flattenVisible(root, listings, expanded),
    [root, listings, expanded],
  );
  const indexOfPath = useMemo(() => {
    const m = new Map<string, number>();
    flat.forEach((n, i) => m.set(n.path, i));
    return m;
  }, [flat]);
  const selectedIndex = selected ? (indexOfPath.get(selected) ?? 0) : 0;

  // Roving keyboard focus, the WebKit-safe ring, and the single Tab stop are
  // owned by useFocusGroup (same as the Workspaces panel): the tree is one Tab
  // stop, ↑/↓/Home/End move between rows, and the ContextMenu key / Shift+F10
  // opens the row's menu. Entry parks on the selected row (`start`), so the
  // host's "first tabbable" lands there on click / region cycle. The tree-only
  // axis (←/→ expand/collapse, Enter rename, ⌘↩ open, …) is handled in
  // handleRowKey, which runs before the group's own key handling.
  const group = useFocusGroup({
    count: flat.length,
    start: selectedIndex,
    orientation: "vertical",
    onMenu: (i, anchor) => {
      const n = flat[i];
      if (n) openFileMenu(n.path, n.isDir, { anchor });
    },
  });

  // Consume a pending post-rename focus target as soon as its row exists in
  // the flattened list (see `pendingFocusPath` above and `commitRename` below).
  useEffect(() => {
    const path = pendingFocusPath.current;
    if (!path) return;
    const idx = indexOfPath.get(path);
    if (idx === undefined) return;
    pendingFocusPath.current = null;
    group.focusItem(idx);
  }, [indexOfPath, group.focusItem]);

  // The tree-specific keys, run before useFocusGroup sees the event. Returns
  // true when it owns the key (the group then skips it); false to defer to the
  // group (↑/↓/Home/End movement, the ContextMenu key).
  function handleRowKey(e: React.KeyboardEvent, path: string, isDir: boolean) {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const action = treeArrowNav({ key: e.key, path, isDir, expanded, root });
      if (action?.kind === "expand") {
        setExpanded((prev) => {
          const next = { ...prev, [path]: true };
          persistExpanded(next);
          return next;
        });
        if (!listings[path]) load(path);
      } else if (action?.kind === "collapse") {
        setExpanded((prev) => {
          const next = { ...prev, [path]: false };
          persistExpanded(next);
          return next;
        });
      } else if (action?.kind === "focusParent") {
        const parentIdx = indexOfPath.get(action.path);
        if (parentIdx !== undefined) group.focusItem(parentIdx);
      }
      return true;
    }
    const name = path.split("/").pop() ?? path;
    const shortcut = matchRowShortcut(e, isMac);
    if (!shortcut) return false;
    e.preventDefault();
    switch (shortcut) {
      case "open":
        if (!isDir) editors.open(path, { workspaceId });
        break;
      case "rename":
        setRenaming(path);
        break;
      case "delete":
        void ctxDelete(path, name);
        break;
      case "reveal":
        void ctxReveal(path);
        break;
      case "cut":
        ctxCut(path);
        break;
      case "copy":
        ctxCopy(path);
        break;
      case "copyPath":
        ctxCopyPath(path);
        break;
      case "copyRelPath":
        ctxCopyRelPath(path);
        break;
    }
    return true;
  }

  // Focus-group props for a row, composing the group's handlers with the tree's:
  // selection follows keyboard focus (onFocus → setSelected), and handleRowKey
  // gets first crack at every keydown. Returns `{}` for rows that aren't focus
  // items (the root header, or a path not in the visible list).
  function getRowProps(path: string, isDir: boolean): RowFocusProps {
    const idx = indexOfPath.get(path);
    if (idx === undefined) return {};
    const gp = group.getItemProps(idx);
    return {
      ...gp,
      onFocus: () => {
        gp.onFocus();
        selectPath(path);
      },
      onKeyDown: (e) => {
        if (handleRowKey(e, path, isDir)) return;
        gp.onKeyDown(e);
      },
    };
  }

  async function load(path: string) {
    if (loadingRef.current.has(path)) return;
    loadingRef.current.add(path);
    try {
      const entries = await files.readDir(path);
      setListings((prev) => ({ ...prev, [path]: { entries } }));
    } catch (err) {
      setListings((prev) => ({
        ...prev,
        [path]: { entries: [], error: String(err) },
      }));
    } finally {
      loadingRef.current.delete(path);
    }
  }

  useEffect(() => {
    load(root);
    for (const [path, isExpanded] of Object.entries(expanded)) {
      if (isExpanded && path !== root) load(path);
    }
  }, [root]);

  useEffect(() => {
    const sub = files.watch(root, (evt) => {
      const dirs = new Set<string>();
      for (const p of evt.paths) dirs.add(dirOf(p));
      setListings((prev) => {
        const next = { ...prev };
        for (const d of dirs) {
          if (next[d]) delete next[d];
        }
        return next;
      });
      dirs.forEach((d) => {
        if (expandedRef.current[d] ?? d === root) load(d);
      });
    });
    return () => {
      sub.dispose();
    };
  }, [workspaceId, root]);

  function refreshAll() {
    setListings({});
    load(root);
    for (const [path, isExpanded] of Object.entries(expanded)) {
      if (isExpanded) load(path);
    }
  }

  function collapseAll() {
    const next = collapseAllExpanded(expanded, root);
    setExpanded(next);
    persistExpanded(next);
  }

  async function commitNewItem(name: string) {
    const n = name.trim();
    const dir = newItem?.dir;
    setNewItem(null);
    if (!n || !dir) return;
    const targetPath = dir + "/" + n;
    if (newItem!.type === "file") {
      await files
        .writeText(targetPath, "")
        .catch((e) => console.warn("create file failed", e));
    } else {
      await files
        .createDir(targetPath)
        .catch((e) => console.warn("create dir failed", e));
    }
    // ensure dir is expanded and force-reload its listing
    setExpanded((prev) => {
      const next = { ...prev, [dir]: true };
      persistExpanded(next);
      return next;
    });
    setListings((prev) => {
      const next = { ...prev };
      delete next[dir];
      return next;
    });
    load(dir);
  }

  function toggle(path: string, isDir: boolean) {
    selectPath(path);
    if (!isDir) {
      editors.open(path, { workspaceId, preview: true });
      return;
    }
    setExpanded((prev) => {
      const next = { ...prev, [path]: !prev[path] };
      persistExpanded(next);
      return next;
    });
    if (!listings[path]) load(path);
  }

  function togglePermanent(path: string) {
    selectPath(path);
    editors.open(path, { workspaceId });
  }

  function handleContextMenu(
    e: React.MouseEvent,
    path: string,
    isDir: boolean,
    rootArea = false,
  ) {
    e.preventDefault();
    e.stopPropagation();
    openFileMenu(path, isDir, { at: { x: e.clientX, y: e.clientY } }, rootArea);
  }

  /**
   * Open a row's context menu — at the cursor for a right-click, or anchored to
   * the row when invoked from the keyboard (the ContextMenu key / Shift+F10).
   * `toggle: false` so a stray duplicate event re-opens rather than toggling it
   * shut (mirrors the Workspaces panel).
   */
  function openFileMenu(
    path: string,
    isDir: boolean,
    placement: { at?: { x: number; y: number }; anchor?: HTMLElement | null },
    rootArea = false,
  ) {
    selectPath(path);
    void ctx.ui.showMenu({
      items: menuItemsFor(path, isDir, rootArea),
      toggle: false,
      ...placement,
    });
  }

  function menuItemsFor(
    path: string,
    isDir: boolean,
    rootArea: boolean,
  ): MenuEntry[] {
    const name = path.split("/").pop() ?? "";
    const items: MenuEntry[] = [];
    if (!isDir) {
      items.push({
        label: "Open",
        accelerator: ACCEL.open,
        run: () => ctxOpenToSide(path),
      });
      // "Open With" — only when the file has more than one matching view
      // (e.g. a Markdown file can open as Text or Preview).
      const views = ctx.editors.editorsFor(path);
      if (views.length > 1) {
        items.push({
          label: "Open With",
          submenu: views.map((v) => ({
            label: v.isDefault ? `${v.label}  (default)` : v.label,
            run: () => editors.open(path, { workspaceId, viewType: v.id }),
          })),
        });
      }
    }
    if (isDir) {
      items.push({ label: "New File…", run: () => ctxNewFile(path) });
      items.push({ label: "New Folder…", run: () => ctxNewFolder(path) });
      items.push({
        label: "New Terminal Here",
        run: () => {
          ctx.terminals.create({ cwd: path });
        },
      });
    }
    items.push({
      label: REVEAL_LABEL,
      accelerator: ACCEL.reveal,
      run: () => ctxReveal(path),
    });
    if (!rootArea) {
      items.push({ type: "separator" });
      items.push({
        label: "Cut",
        accelerator: ACCEL.cut,
        run: () => ctxCut(path),
      });
      items.push({
        label: "Copy",
        accelerator: ACCEL.copy,
        run: () => ctxCopy(path),
      });
    }
    items.push({ type: "separator" });
    items.push({
      label: "Copy Path",
      accelerator: ACCEL.copyPath,
      run: () => ctxCopyPath(path),
    });
    items.push({
      label: "Copy Relative Path",
      accelerator: ACCEL.copyRelPath,
      run: () => ctxCopyRelPath(path),
    });
    if (!rootArea) {
      items.push({ type: "separator" });
      items.push({
        label: "Rename…",
        accelerator: ACCEL.rename,
        run: () => ctxRename(path),
      });
      items.push({
        label: "Delete",
        accelerator: ACCEL.delete,
        danger: true,
        run: () => ctxDelete(path, name),
      });
    }
    return items;
  }

  function ctxOpenToSide(path: string) {
    editors.open(path, { workspaceId });
  }

  function ctxNewFile(dir: string) {
    setExpanded((prev) => {
      const next = { ...prev, [dir]: true };
      persistExpanded(next);
      return next;
    });
    if (!listings[dir]) load(dir);
    setNewItem({ dir, type: "file" });
  }

  function ctxNewFolder(dir: string) {
    setExpanded((prev) => {
      const next = { ...prev, [dir]: true };
      persistExpanded(next);
      return next;
    });
    if (!listings[dir]) load(dir);
    setNewItem({ dir, type: "folder" });
  }

  async function ctxReveal(path: string) {
    await files.reveal(path).catch((e) => console.warn("reveal failed", e));
  }

  function ctxCut(path: string) {
    fileCb.current = { path, op: "cut" };
  }

  function ctxCopy(path: string) {
    fileCb.current = { path, op: "copy" };
  }

  function ctxCopyPath(path: string) {
    navigator.clipboard.writeText(path);
  }

  function ctxCopyRelPath(path: string) {
    const rel = path.startsWith(root + "/")
      ? path.slice(root.length + 1)
      : path;
    navigator.clipboard.writeText(rel);
  }

  function ctxRename(path: string) {
    setRenaming(path);
  }

  async function ctxDelete(path: string, name: string) {
    const ok = await ctx.ui.confirm({
      title: `Delete "${name}"?`,
      body: "This action cannot be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (ok)
      await files.delete(path).catch((e) => console.warn("delete failed", e));
  }

  async function commitRename(oldPath: string, newName: string) {
    setRenaming(null);
    const trimmed = newName.trim();
    if (!trimmed) return;
    const dir = dirOf(oldPath);
    const newPath = dir + "/" + trimmed;
    if (newPath === oldPath) return;
    try {
      await files.rename(oldPath, newPath);
    } catch (e) {
      console.warn("rename failed", e);
      return;
    }
    // Follow the rename: keep selection on the renamed row, and once the
    // listing reload remounts it under the new path, restore keyboard focus
    // there too (see the pendingFocusPath effect above) instead of leaving
    // focus stranded or moving to whatever row happens to fill the gap.
    selectPath(newPath);
    pendingFocusPath.current = newPath;
  }

  async function handleDrop(draggedPath: string, targetDir: string) {
    // Prevent dropping onto self or own descendant
    if (draggedPath === targetDir) return;
    if (targetDir.startsWith(draggedPath + "/")) return;
    const name = draggedPath.split("/").pop()!;
    const newPath = targetDir + "/" + name;
    if (newPath === draggedPath) return;
    await files
      .rename(draggedPath, newPath)
      .catch((e) => console.warn("move failed", e));
    // Refresh old parent and new target dir
    const oldParent = dirOf(draggedPath);
    setListings((prev) => {
      const next = { ...prev };
      delete next[oldParent];
      delete next[targetDir];
      return next;
    });
    load(oldParent);
    load(targetDir);
  }

  // Empty-space drops on the tree container move the file to the root. Row
  // targets call stopPropagation (onDrop returns true), so this only fires for
  // drops that don't land on a row.
  const handleDropRef = useRef(handleDrop);
  handleDropRef.current = handleDrop;
  useEffect(() => {
    const el = fileTreeRef.current;
    if (!el) return;
    const reg = ctx.dnd.registerDropTarget(el, {
      accepts: [DND_MIME.filePath],
      onDragOver: () => "move",
      onDrop: ({ items }) => {
        for (const item of items.filter((i) => i.mime === DND_MIME.filePath)) {
          handleDropRef.current(item.value, root);
        }
        return true;
      },
    });
    return () => reg.dispose();
  }, [ctx, root]);

  return (
    <>
      <div
        ref={fileTreeRef}
        className="file-tree"
        role="tree"
        aria-label={rootLabel}
        // onBlur (from containerProps) clears the keyboard ring when focus
        // leaves the tree — e.g. Tab handing off to the status bar.
        {...group.containerProps}
        onContextMenu={(e) => handleContextMenu(e, root, true, true)}
      >
        <DirNode
          dnd={ctx.dnd}
          getRowProps={getRowProps}
          path={root}
          name={rootLabel}
          isRoot
          depth={0}
          expanded={expanded}
          listings={listings}
          onToggle={toggle}
          onOpenPermanent={togglePermanent}
          onContextMenu={handleContextMenu}
          renaming={renaming}
          onRenameCommit={commitRename}
          onRenameCancel={() => setRenaming(null)}
          newItem={newItem}
          onNewItem={setNewItem}
          onNewItemCommit={commitNewItem}
          onNewItemCancel={() => setNewItem(null)}
          selected={selected}
          onDrop={handleDrop}
          isWorktree={isWorktree}
          rootActions={{
            onNewFile: () => setNewItem({ dir: root, type: "file" }),
            onNewFolder: () => setNewItem({ dir: root, type: "folder" }),
            onRefresh: refreshAll,
            onCollapseAll: collapseAll,
          }}
        />
      </div>
    </>
  );
}
