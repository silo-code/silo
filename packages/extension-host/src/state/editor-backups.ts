import { invoke } from "@tauri-apps/api/core";

// Hot-exit backups (ADR 0022, tier 1 "config"): each editor tab with unsaved
// edits gets a backup file at `<configDir>/backups/<editorId>.json` so the buffer
// survives a restart (VS Code "hot exit"). Kept separate from the per-workspace
// state files (`workspaces/<id>.json`) so a large dirty buffer never bloats — or
// churns the diff-writes of — the workspace record. The latest content is held in
// an in-memory map and written *debounced*; because the map always holds the
// newest text, a quit-time `flushEditorBackups()` captures it even mid-debounce.
//
// `state/` is a leaf that must not import `services/`, but talking to the platform
// directly is allowed (as `persistence.ts` does). File I/O reuses the same Rust fs
// commands the persistence layer uses — `fs_write_text` (creates the parent dir),
// `fs_read_text`, `fs_read_dir`, `fs_delete` — and the same serialization
// discipline: every op runs through one promise chain (`enqueue`, mirroring
// `persistence.ts`'s `persistNow`) so a delete can never reorder ahead of an
// in-flight write and resurrect a backup we just cleared over a saved file.
// Backups are precious user data, so they live in the config tier alongside
// `workspaces/`.

const WRITE_DEBOUNCE_MS = 600;
const SUFFIX = ".json";

/** A persisted backup: the unsaved text plus the path it belongs to (null = untitled). */
export interface EditorBackup {
  filePath: string | null;
  content: string;
}

let backupDir = "";
/** editorId → latest buffer whose newest content may not yet be on disk. */
const pending = new Map<string, EditorBackup>();
let writeTimer: number | null = null;

// Serialize all backup file I/O: each task runs only after the previous one
// settles (success or failure), so writes/deletes/reads to the same file keep
// their issue order. Without this, `clearEditorBackup`'s delete and an in-flight
// `flushEditorBackups` write are independent `invoke`s whose completion order is
// undefined — a delete landing first lets the write recreate a stale backup.
let ioChain: Promise<unknown> = Promise.resolve();
function noop(): void {}
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = ioChain.then(task, task);
  ioChain = result.then(noop, noop);
  return result;
}

/** Set the backups directory from the identity-keyed config root. Called by `hydrate`. */
export function setBackupDir(configDir: string): void {
  backupDir = `${configDir}/backups`;
}

function backupPath(editorId: string): string {
  return `${backupDir}/${editorId}${SUFFIX}`;
}

interface RawDirEntry {
  name: string;
  is_dir: boolean;
}

function writeBackup(editorId: string, entry: EditorBackup): Promise<void> {
  return enqueue(() =>
    invoke("fs_write_text", {
      path: backupPath(editorId),
      content: JSON.stringify(entry),
    }),
  );
}

// Throttle (not reset): schedule one flush per window. Resetting the timer on
// every edit let a steady stream of edits — even in a *different* editor — starve
// an already-pending backup indefinitely; throttling guarantees every pending
// entry reaches disk within WRITE_DEBOUNCE_MS of being queued.
function scheduleFlush(): void {
  if (writeTimer !== null) return;
  writeTimer = window.setTimeout(() => {
    writeTimer = null;
    void flushEditorBackups();
  }, WRITE_DEBOUNCE_MS);
}

/**
 * Record (or update) a tab's unsaved buffer and schedule a debounced write. The
 * content lands in the in-memory map immediately so {@link flushEditorBackups}
 * can persist the very latest text on quit even if the debounce hasn't fired.
 * No-op until {@link setBackupDir} has run.
 */
export function setEditorBackup(
  editorId: string,
  filePath: string | null,
  content: string,
): void {
  if (!backupDir) return;
  pending.set(editorId, { filePath, content });
  scheduleFlush();
}

/** Drop a tab's backup — from memory and disk. Called on save, revert-to-clean, and close. */
export async function clearEditorBackup(editorId: string): Promise<void> {
  pending.delete(editorId);
  if (!backupDir) return;
  // Serialized so it lands *after* any in-flight write for this id, rather than
  // racing it (a delete that wins lets the write recreate the file).
  await enqueue(() =>
    invoke("fs_delete", { path: backupPath(editorId) }),
  ).catch(() => {
    // already gone / never written
  });
}

/**
 * Read a tab's backup, or `null` if there is none / it's unreadable. The
 * in-memory map wins over the file: a tab that unmounts and remounts within a
 * session (e.g. a workspace switch) must restore the freshest content even if
 * the debounced write hasn't flushed it to disk yet.
 */
export async function readEditorBackup(
  editorId: string,
): Promise<EditorBackup | null> {
  const inMemory = pending.get(editorId);
  if (inMemory) return inMemory;
  if (!backupDir) return null;
  try {
    const text = await enqueue(() =>
      invoke<string>("fs_read_text", { path: backupPath(editorId) }),
    );
    const parsed = JSON.parse(text) as Partial<EditorBackup>;
    if (typeof parsed?.content !== "string") return null;
    return { filePath: parsed.filePath ?? null, content: parsed.content };
  } catch {
    return null; // no backup / unreadable / bad JSON
  }
}

/**
 * Write every pending backup to disk now (cancelling the debounce). Called on
 * quit so the latest unsaved text is durable. An entry is dropped from the map
 * once written, unless a newer edit arrived during the await (reference check).
 * A failed write keeps its entry and re-arms the timer so it's retried rather
 * than stranded until the user next types.
 */
export async function flushEditorBackups(): Promise<void> {
  if (writeTimer !== null) {
    window.clearTimeout(writeTimer);
    writeTimer = null;
  }
  if (!backupDir || pending.size === 0) return;
  const snapshot = [...pending.entries()];
  await Promise.all(
    snapshot.map(async ([editorId, entry]) => {
      try {
        await writeBackup(editorId, entry);
        if (pending.get(editorId) === entry) pending.delete(editorId);
      } catch (err) {
        console.error(`backup write failed for ${editorId}`, err);
      }
    }),
  );
  // Anything still pending is a write that failed (a new edit during the flush
  // would have re-armed the timer itself); retry it on the next window.
  if (pending.size > 0) scheduleFlush();
}

/**
 * Delete backup files whose editor is no longer live — crash-orphans and tabs
 * closed in a prior session. Called once at startup with the ids of every editor
 * across all workspaces.
 */
export async function sweepEditorBackups(liveIds: Set<string>): Promise<void> {
  if (!backupDir) return;
  let entries: RawDirEntry[];
  try {
    entries = await enqueue(() =>
      invoke<RawDirEntry[]>("fs_read_dir", { path: backupDir }),
    );
  } catch {
    return; // dir doesn't exist yet — nothing to sweep
  }
  const orphans = orphanBackupIds(
    entries.filter((e) => !e.is_dir).map((e) => e.name),
    liveIds,
  );
  await Promise.all(
    orphans.map((id) =>
      enqueue(() => invoke("fs_delete", { path: backupPath(id) })).catch(noop),
    ),
  );
}

/** Pure: backup filenames (`<editorId>.json`) whose editor isn't live → ids to delete. */
export function orphanBackupIds(
  fileNames: string[],
  liveIds: Set<string>,
): string[] {
  return fileNames
    .filter((n) => n.endsWith(SUFFIX))
    .map((n) => n.slice(0, -SUFFIX.length))
    .filter((id) => !liveIds.has(id));
}

/**
 * Pure: decide what a freshly-mounted editor shows, given the on-disk text
 * (`null` for an untitled buffer) and any restored backup. A backup that differs
 * from disk is the user's unsaved work (restore it, dirty); a backup equal to
 * disk is stale (ignore it — the caller clears it); no backup ⇒ the disk text,
 * clean.
 */
export function resolveRestoredBuffer(input: {
  diskText: string | null;
  backup: string | null;
}): { content: string; dirty: boolean } {
  const base = input.diskText ?? "";
  if (input.backup !== null && input.backup !== base) {
    return { content: input.backup, dirty: true };
  }
  return { content: base, dirty: false };
}
