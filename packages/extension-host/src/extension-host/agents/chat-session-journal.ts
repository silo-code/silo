/**
 * The **transcript journal** (RFC 0042) — an append-only, typed record of a
 * Chat session's update stream, one {@link AgentSessionUpdate} per line, at
 * `<workspace-state-dir>/chat-sessions/<sessionId>.jsonl`. Durable and
 * independent of the agent: `acp-sessions-service.ts` paints a restored panel
 * from this instantly, and it is the only record for a `session/resume`
 * reconnect (no replay) or an agent that can do neither `resume` nor `load`.
 *
 * **No on-disk compaction** (RFC 0042 decision) — every catalog agent replays
 * a whole session in one shot on `load`, and windowing a long transcript is a
 * render concern, not a disk one. The writer keeps every line written so far
 * in memory for the life of the connection, so a flush is one whole-file
 * rewrite rather than a read-modify-write (there is no `fs_append_text`
 * command), and debounces flushes the same way `WorkspaceDock` debounces
 * `dockLayout` saves.
 */

import {
  fsCreateDir,
  fsDelete,
  fsPathExists,
  fsReadDir,
  fsReadText,
  fsWriteText,
} from "../../services/tauri-fs";
import { workspaceStateDir } from "../../services/user-config";
import type { AgentSessionUpdate } from "@silo-code/sdk";
import { agentsChannel } from "./agents-channel";

const FLUSH_DEBOUNCE_MS = 250;
const JOURNAL_EXTENSION = ".jsonl";

function chatSessionsDir(stateDir: string): string {
  return `${stateDir}/chat-sessions`;
}

function journalPath(stateDir: string, sessionId: string): string {
  return `${chatSessionsDir(stateDir)}/${sessionId}${JOURNAL_EXTENSION}`;
}

/** Raw, non-empty lines of a session's journal — `[]` when it has none yet
 *  (a brand-new session, or one that never wrote anything). Never throws. */
export async function readJournalLines(
  workspaceId: string,
  sessionId: string,
): Promise<string[]> {
  const stateDir = await workspaceStateDir(workspaceId);
  const path = journalPath(stateDir, sessionId);
  try {
    if (!(await fsPathExists(path))) return [];
    const text = await fsReadText(path);
    return text.split("\n").filter((line) => line.trim().length > 0);
  } catch (err) {
    agentsChannel.debug(`could not read chat session journal ${path}: ${err}`);
    return [];
  }
}

/** Parse journal lines into {@link AgentSessionUpdate}s. A line that fails to
 *  parse, or does not look like an update, is skipped rather than sinking the
 *  whole read — one corrupt line (a torn write across a crash) should not
 *  cost the rest of the conversation. */
export function parseJournalLines(
  lines: readonly string[],
): AgentSessionUpdate[] {
  const out: AgentSessionUpdate[] = [];
  for (const line of lines) {
    try {
      const parsed: unknown = JSON.parse(line);
      if (
        parsed &&
        typeof parsed === "object" &&
        typeof (parsed as Record<string, unknown>).kind === "string"
      ) {
        out.push(parsed as AgentSessionUpdate);
      }
    } catch {
      // Skip — see doc comment above.
    }
  }
  return out;
}

/**
 * Restore a `session/load` replay's missing `user_message_chunk.timestamp`
 * from what the journal already had on disk before the reconnect.
 *
 * `session/load` re-sends the whole transcript itself (RFC 0042 restore
 * flow), including a fresh `user_message_chunk` for every past turn — but
 * that one comes straight off the wire, and the Agent Client Protocol has no
 * timestamp field, so it never carries one, even for a turn whose *original*
 * journal line did (stamped by {@link AgentSessionUpdate.timestamp} at
 * `session/prompt` time). The caller drops the old journal wholesale once the
 * replay lands — this must run first, or every restore through `load`
 * permanently forgets when a past turn was sent.
 *
 * Matched by **position**, not text: the `n`th `user_message_chunk` in
 * `priorLines` is assumed to be the same turn as the `n`th one in
 * `replayedLines`, since a replay is the same conversation in the same
 * order — comparing text would fail for a turn ACP carries as content blocks
 * rather than plain text. A turn that predates this field (no prior
 * timestamp) still holds its position in the count, so a later turn's
 * timestamp is never shifted onto the wrong one. Every other line — anything
 * not a timestamp-less `user_message_chunk` — passes through as the exact
 * original string, never round-tripped through JSON, so this never perturbs
 * a line it had no reason to touch.
 */
export function backfillUserPromptTimestamps(
  priorLines: readonly string[],
  replayedLines: readonly string[],
): string[] {
  const priorTimestamps: (string | undefined)[] = [];
  for (const line of priorLines) {
    try {
      const parsed = JSON.parse(line) as { kind?: string; timestamp?: string };
      if (parsed.kind === "user_message_chunk") {
        priorTimestamps.push(
          typeof parsed.timestamp === "string" ? parsed.timestamp : undefined,
        );
      }
    } catch {
      // Skip — a torn line can't tell us anything about ordering.
    }
  }
  if (priorTimestamps.length === 0) return [...replayedLines];
  let cursor = 0;
  return replayedLines.map((line) => {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return line;
    }
    if (parsed.kind !== "user_message_chunk") return line;
    const timestamp = priorTimestamps[cursor];
    cursor++;
    if (typeof parsed.timestamp === "string" || timestamp === undefined) {
      return line;
    }
    return JSON.stringify({ ...parsed, timestamp });
  });
}

/** Read and parse one session's journal in one call — the common case for a
 *  restore, where both the raw lines (to seed a continuing writer) and the
 *  parsed updates (to paint the transcript) are needed. */
export async function readJournal(
  workspaceId: string,
  sessionId: string,
): Promise<{ lines: string[]; updates: AgentSessionUpdate[] }> {
  const lines = await readJournalLines(workspaceId, sessionId);
  return { lines, updates: parseJournalLines(lines) };
}

export interface ChatSessionJournalWriter {
  /** Append one update. Debounced to disk — see the module doc comment. */
  append(update: AgentSessionUpdate): void;
  /** Force any buffered lines to disk now. Call before disposing so the final
   *  turns of a session are not lost to the debounce window. */
  flush(): Promise<void>;
  /**
   * Drop the first `n` in-memory lines and schedule a flush — for when a
   * `session/load` reconnect's own replay (captured live via {@link append}
   * while the call was in flight) proves authoritative and the pre-existing
   * seed it was created with must not be kept under it, or every turn would
   * render twice. A no-op past the end of the buffer.
   */
  dropSeed(n: number): void;
  /**
   * Replace the entire in-memory buffer and schedule a flush — for {@link
   * dropSeed}'s job (discard a `session/load` replay's pre-existing seed)
   * combined with a correction to what's kept (see
   * {@link backfillUserPromptTimestamps}), in one atomic write. Unlike
   * disposing this writer and constructing a fresh one seeded with the
   * corrected lines, this keeps {@link schedule}'s dirty flag: a fresh
   * writer's `flush()` is a no-op until something marks it dirty, so
   * swapping writers here would silently drop the correction from disk until
   * the next unrelated turn happened to schedule a write.
   */
  replaceLines(lines: readonly string[]): void;
  /**
   * The lines written so far, in memory — for re-keying a writer to a
   * different session id after `session/load` adopts one (no data lost, just
   * the file it belongs to changing). Pair with a fresh {@link
   * createJournalWriter} for the new id, seeded with this snapshot.
   */
  snapshotLines(): readonly string[];
  /** Cancel any pending flush timer without writing. Call after {@link flush}
   *  has already landed the final state, or when the journal is being
   *  abandoned outright (e.g. the connect handshake failed before any turn
   *  ran). */
  dispose(): void;
  /**
   * Kill the writer for good and resolve once any write already in flight has
   * settled — for a **session reset** (RFC 0048), which deletes this journal
   * immediately afterward.
   *
   * Stronger than {@link dispose} in the two ways deletion needs.
   * `dispose()` stops the timer but leaves the buffer dirty, so a later
   * {@link flush} — the handle's own unawaited teardown flush, say — still
   * rewrites the whole file and puts a deleted journal straight back. An
   * abandoned writer ignores every subsequent {@link append} and
   * {@link flush}. And awaiting it means the unlink cannot lose a race with a
   * write that was already past its `dirty` check.
   */
  abandon(): Promise<void>;
}

/**
 * A writer for one session's journal, seeded with whatever was already on
 * disk (`seedLines`, from {@link readJournalLines}) so a resumed session keeps
 * appending to its own history rather than starting the file over.
 */
export function createJournalWriter(
  workspaceId: string,
  sessionId: string,
  seedLines: readonly string[] = [],
): ChatSessionJournalWriter {
  const lines: string[] = [...seedLines];
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let abandoned = false;
  // The write currently in flight, if any — `abandon()` awaits it so a caller
  // about to delete this journal cannot lose a race with a write that already
  // passed its `dirty` check.
  let inflight: Promise<void> | null = null;

  async function writeNow(): Promise<void> {
    if (abandoned || !dirty) return;
    dirty = false;
    const stateDir = await workspaceStateDir(workspaceId);
    const dir = chatSessionsDir(stateDir);
    try {
      await fsCreateDir(dir);
      await fsWriteText(
        journalPath(stateDir, sessionId),
        lines.length > 0 ? lines.join("\n") + "\n" : "",
      );
    } catch (err) {
      agentsChannel.debug(
        `could not write chat session journal for ${sessionId}: ${err}`,
      );
    }
  }

  /** Run a write, remembering it as {@link inflight} for `abandon()`. */
  function startWrite(): Promise<void> {
    const write = writeNow().finally(() => {
      if (inflight === write) inflight = null;
    });
    inflight = write;
    return write;
  }

  function schedule(): void {
    if (disposed) return;
    dirty = true;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      void startWrite();
    }, FLUSH_DEBOUNCE_MS);
  }

  return {
    append(update) {
      if (disposed) return;
      lines.push(JSON.stringify(update));
      schedule();
    },
    async flush() {
      if (abandoned) return;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await startWrite();
    },
    dropSeed(n) {
      if (disposed || n <= 0) return;
      lines.splice(0, n);
      schedule();
    },
    replaceLines(newLines) {
      if (disposed) return;
      lines.length = 0;
      lines.push(...newLines);
      schedule();
    },
    snapshotLines() {
      return [...lines];
    },
    dispose() {
      disposed = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
    async abandon() {
      abandoned = true;
      disposed = true;
      dirty = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await inflight;
    },
  };
}

/**
 * Delete one session's journal file — a **session reset** (RFC 0048) throwing
 * the prior conversation away at the user's explicit request. Host-internal:
 * an extension reaches this only through `connect({ resume: { startFresh:
 * true, transcript: "discard" } })`, never as a file operation of its own.
 *
 * Best-effort, like {@link pruneOrphanedChatJournals} — a failed unlink is
 * logged and swallowed rather than sinking the reset. The worst case is a
 * stale file for an id nothing references any more, which the orphan prune
 * eventually collects.
 *
 * Abandon the session's live writer ({@link ChatSessionJournalWriter.abandon})
 * **before** calling this, or its buffer writes the file straight back.
 */
export async function deleteJournalFile(
  workspaceId: string,
  sessionId: string,
): Promise<void> {
  try {
    const stateDir = await workspaceStateDir(workspaceId);
    const path = journalPath(stateDir, sessionId);
    if (!(await fsPathExists(path))) return;
    await fsDelete(path);
    agentsChannel.debug(`discarded chat session journal ${path}`);
  } catch (err) {
    agentsChannel.debug(
      `could not discard chat session journal for ${sessionId}: ${err}`,
    );
  }
}

const DEFAULT_MAX_ORPHAN_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Prune orphaned journals on workspace load (RFC 0042, "orphaned journals"):
 * any `chat-sessions/*.jsonl` with no {@link import("@silo-code/sdk").DockPanelRecord}
 * referencing its session id **and** no write in `maxAgeMs` is deleted.
 * **Never called on quit** — a crash-orphaned journal is sometimes the only
 * copy of a conversation the user still wants, so age alone (not "no
 * referencing record" alone) gates deletion. Best-effort: a failure here never
 * blocks a workspace load.
 */
export async function pruneOrphanedChatJournals(
  workspaceId: string,
  referencedSessionIds: ReadonlySet<string>,
  maxAgeMs: number = DEFAULT_MAX_ORPHAN_AGE_MS,
): Promise<void> {
  try {
    const stateDir = await workspaceStateDir(workspaceId);
    const dir = chatSessionsDir(stateDir);
    if (!(await fsPathExists(dir))) return;
    const now = Date.now();
    for (const entry of await fsReadDir(dir)) {
      if (entry.isDir || !entry.name.endsWith(JOURNAL_EXTENSION)) continue;
      const sessionId = entry.name.slice(0, -JOURNAL_EXTENSION.length);
      if (referencedSessionIds.has(sessionId)) continue;
      if (now - entry.modifiedMs < maxAgeMs) continue;
      try {
        await fsDelete(entry.path);
        agentsChannel.debug(
          `pruned orphaned chat session journal ${entry.path}`,
        );
      } catch (err) {
        agentsChannel.debug(`could not prune chat session journal: ${err}`);
      }
    }
  } catch (err) {
    agentsChannel.debug(`chat session journal prune skipped: ${err}`);
  }
}
