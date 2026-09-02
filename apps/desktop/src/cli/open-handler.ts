import type { Workspace } from "@silo-code/sdk";
import {
  store,
  createWorkspace,
  activateWorkspace,
  openEditor,
  getExtensionManager,
} from "@silo-code/extension-host";

/**
 * A resolved `silo <path>` argument from the host (see `src-tauri`'s
 * `commands/cli.rs`). `path` is absolute; `kind` says what's there.
 */
export interface CliOpenRequest {
  path: string;
  kind: "dir" | "file" | "missing";
}

/** Normalize path separators to forward slashes (Windows-safe). */
function toForwardSlash(p: string): string {
  return p.replace(/\\/g, "/");
}

/** Strip trailing separators so `/a/b` and `/a/b/` compare equal (keeps root). */
export function normalizeFolder(p: string): string {
  const fwd = toForwardSlash(p);
  return fwd.length > 1 ? fwd.replace(/\/+$/, "") : fwd;
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

/** True when `folder` is `dir` itself or lives inside it — matched at a path
 *  segment boundary, so `/a/b` contains `/a/b/c` but not `/a/bc`. */
export function folderContains(dir: string, folder: string): boolean {
  const d = normalizeFolder(dir);
  const f = normalizeFolder(folder);
  return f === d || f.startsWith(d === "/" ? "/" : `${d}/`);
}

/**
 * The workspace whose primary folder or one of its `extraFolders` **contains**
 * `path`. Used by `silo agent run` to launch into the workspace the shell is
 * actually in (RFC 0033 R5), where `findWorkspaceByFolder`'s exact-match is too
 * strict.
 *
 * Ranked by ADR 0047's tie-breaks, in order: the deepest (longest) matching
 * root; then an **open** workspace over a soft-closed one; then a match on the
 * primary `folder` over one on `extraFolders`; then the active workspace.
 * Soft-closed workspaces are candidates on purpose — matching one and
 * activating it reopens it, which beats dropping the caller's path into an
 * unrelated workspace that merely happens to be focused.
 */
export function findWorkspaceContaining(
  workspaces: Record<string, Workspace>,
  path: string,
  activeWorkspaceId?: string | null,
): Workspace | undefined {
  let best: Workspace | undefined;
  let bestRank: readonly number[] = [];
  for (const w of Object.values(workspaces)) {
    const roots = [w.folder, ...(w.extraFolders ?? [])];
    for (const [i, folder] of roots.entries()) {
      if (!folderContains(folder, path)) continue;
      const rank = [
        normalizeFolder(folder).length, // deepest root
        w.closedAt ? 0 : 1, // open over soft-closed
        i === 0 ? 1 : 0, // primary folder over an extra
        w.id === activeWorkspaceId ? 1 : 0, // then whatever is active
      ];
      if (!best || compareRank(rank, bestRank) > 0) {
        best = w;
        bestRank = rank;
      }
    }
  }
  return best;
}

/** Lexicographic compare of two equal-length rank tuples. */
function compareRank(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
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

/** Install an extension from a local folder path (same as "Install from folder" in the UI). */
export async function applyCliInstall(path: string): Promise<void> {
  await getExtensionManager().installFromFolder(path);
}

/**
 * Install an extension by registry id (`silo install acme.weather`). The
 * tarball is digest-verified against the registry's pinned sha256. Like the
 * folder path above, an explicit CLI install implies consent — the manifest's
 * permissions are granted without the UI modal (same contract since the CLI
 * shipped); they're visible afterward on the Extensions page.
 */
export async function applyCliInstallFromRegistry(id: string): Promise<void> {
  await getExtensionManager().installFromRegistry(id, async () => true);
}

/** Uninstall an extension by its id (e.g. `"dave.clock"`). */
export async function applyCliUninstall(id: string): Promise<void> {
  await getExtensionManager().uninstall(id);
}
