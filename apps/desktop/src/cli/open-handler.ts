import type { Workspace } from "@silo-code/sdk";
import {
  store,
  createWorkspace,
  activateWorkspace,
  openEditor,
} from "@silo-code/extension-host";

/**
 * A resolved `silo <path>` argument from the host (see `src-tauri`'s
 * `commands/cli.rs`). `path` is absolute; `kind` says what's there.
 */
export interface CliOpenRequest {
  path: string;
  kind: "dir" | "file" | "missing";
}

/** Strip trailing separators so `/a/b` and `/a/b/` compare equal (keeps root). */
export function normalizeFolder(p: string): string {
  return p.length > 1 ? p.replace(/\/+$/, "") : p;
}

/** POSIX dirname of an absolute path (the host always hands us absolute paths). */
export function dirname(p: string): string {
  const norm = normalizeFolder(p);
  const idx = norm.lastIndexOf("/");
  if (idx <= 0) return "/";
  return norm.slice(0, idx);
}

/** Last path segment, e.g. `/Users/me/proj` → `proj`. Falls back to the path. */
export function basename(p: string): string {
  const norm = normalizeFolder(p);
  const idx = norm.lastIndexOf("/");
  return idx >= 0 && idx < norm.length - 1 ? norm.slice(idx + 1) : norm;
}

/**
 * Find an existing workspace rooted at `folder` (its primary folder or one of
 * its `extraFolders`), comparing normalized paths. Returns `undefined` if none.
 */
export function findWorkspaceByFolder(
  workspaces: Record<string, Workspace>,
  folder: string,
): Workspace | undefined {
  const target = normalizeFolder(folder);
  return Object.values(workspaces).find(
    (w) =>
      normalizeFolder(w.folder) === target ||
      (w.extraFolders ?? []).some((f) => normalizeFolder(f) === target),
  );
}

/**
 * Act on a resolved CLI request against the live workspace store:
 *
 * - **dir** — activate the existing workspace for that folder, else create one
 *   rooted there and activate it.
 * - **file** — open the file in the active workspace; if none is active, create
 *   a workspace rooted at the file's parent folder first.
 * - **missing** — no-op (warn).
 *
 * The window is already being foregrounded by the host; this only drives state.
 */
export function applyCliOpen(req: CliOpenRequest): void {
  if (req.kind === "missing") {
    console.warn(`[silo cli] path not found: ${req.path}`);
    return;
  }

  if (req.kind === "dir") {
    const existing = findWorkspaceByFolder(store.workspaces, req.path);
    const id =
      existing?.id ??
      createWorkspace({ folder: req.path, name: basename(req.path) }).id;
    activateWorkspace(id);
    return;
  }

  // file
  let workspaceId = store.activeWorkspaceId;
  if (!workspaceId) {
    const parent = dirname(req.path);
    workspaceId = createWorkspace({
      folder: parent,
      name: basename(parent),
    }).id;
    activateWorkspace(workspaceId);
  }
  openEditor(workspaceId, req.path);
}
