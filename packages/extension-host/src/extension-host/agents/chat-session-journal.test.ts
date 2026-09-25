import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentSessionUpdate } from "@silo-code/sdk";

const {
  fsCreateDir,
  fsDelete,
  fsPathExists,
  fsReadDir,
  fsReadText,
  fsWriteText,
} = vi.hoisted(() => ({
  fsCreateDir: vi.fn(),
  fsDelete: vi.fn(),
  fsPathExists: vi.fn(),
  fsReadDir: vi.fn(),
  fsReadText: vi.fn(),
  fsWriteText: vi.fn(),
}));

vi.mock("../../services/tauri-fs", () => ({
  fsCreateDir,
  fsDelete,
  fsPathExists,
  fsReadDir,
  fsReadText,
  fsWriteText,
}));
vi.mock("../../services/user-config", () => ({
  workspaceStateDir: async (id: string) => `/cfg/workspaces/${id}`,
}));

import {
  backfillUserPromptTimestamps,
  createJournalWriter,
  deleteJournalFile,
  parseJournalLines,
  pruneOrphanedChatJournals,
  readJournal,
  readJournalLines,
} from "./chat-session-journal";

const flush = () => new Promise((r) => setTimeout(r, 0));

function update(kind: string, text?: string): AgentSessionUpdate {
  return { kind, text, raw: {} } as AgentSessionUpdate;
}

beforeEach(() => {
  vi.clearAllMocks();
  fsCreateDir.mockResolvedValue(undefined);
  fsWriteText.mockResolvedValue(undefined);
  fsDelete.mockResolvedValue(undefined);
});

describe("readJournalLines / readJournal", () => {
  it("returns [] when the journal file does not exist", async () => {
    fsPathExists.mockResolvedValue(false);
    expect(await readJournalLines("ws1", "s1")).toEqual([]);
    expect(fsReadText).not.toHaveBeenCalled();
  });

  it("returns [] and swallows the error when reading fails", async () => {
    fsPathExists.mockResolvedValue(true);
    fsReadText.mockRejectedValue(new Error("boom"));
    expect(await readJournalLines("ws1", "s1")).toEqual([]);
  });

  it("splits non-empty lines and drops blank ones", async () => {
    fsPathExists.mockResolvedValue(true);
    fsReadText.mockResolvedValue('{"kind":"a"}\n\n{"kind":"b"}\n');
    const lines = await readJournalLines("ws1", "s1");
    expect(lines).toEqual(['{"kind":"a"}', '{"kind":"b"}']);
  });

  it("reads from the workspace-state-dir chat-sessions path", async () => {
    fsPathExists.mockResolvedValue(true);
    fsReadText.mockResolvedValue("");
    await readJournalLines("ws1", "s1");
    expect(fsPathExists).toHaveBeenCalledWith(
      "/cfg/workspaces/ws1/chat-sessions/s1.jsonl",
    );
  });

  it("readJournal returns both raw lines and parsed updates", async () => {
    fsPathExists.mockResolvedValue(true);
    fsReadText.mockResolvedValue(
      '{"kind":"agent_message_chunk","text":"hi"}\n',
    );
    const { lines, updates } = await readJournal("ws1", "s1");
    expect(lines).toHaveLength(1);
    expect(updates).toEqual([{ kind: "agent_message_chunk", text: "hi" }]);
  });
});

describe("parseJournalLines", () => {
  it("skips a corrupt line without failing the rest", () => {
    const updates = parseJournalLines([
      '{"kind":"a"}',
      "not json at all",
      '{"kind":"b"}',
    ]);
    expect(updates.map((u) => u.kind)).toEqual(["a", "b"]);
  });

  it("skips a line that parses but isn't update-shaped", () => {
    expect(
      parseJournalLines(['{"notAKind":1}', "42", '"just a string"']),
    ).toEqual([]);
  });
});

describe("backfillUserPromptTimestamps", () => {
  it("copies a prior user turn's timestamp onto the replay's timestamp-less line at the same position", () => {
    const prior = [
      JSON.stringify({
        kind: "user_message_chunk",
        text: "what model is this?",
        timestamp: "2026-09-07T19:38:00.000Z",
      }),
      JSON.stringify({ kind: "agent_message_chunk", text: "Haiku 4.5" }),
    ];
    const replayed = [
      JSON.stringify({
        kind: "user_message_chunk",
        text: "what model is this?",
      }),
      JSON.stringify({ kind: "agent_message_chunk", text: "Haiku 4.5" }),
    ];
    const result = backfillUserPromptTimestamps(prior, replayed);
    expect(JSON.parse(result[0]).timestamp).toBe("2026-09-07T19:38:00.000Z");
  });

  it("never touches a line the replay already stamped", () => {
    const prior = [
      JSON.stringify({
        kind: "user_message_chunk",
        text: "a",
        timestamp: "2026-01-01T00:00:00.000Z",
      }),
    ];
    const replayed = [
      JSON.stringify({
        kind: "user_message_chunk",
        text: "a",
        timestamp: "2026-06-01T00:00:00.000Z",
      }),
    ];
    expect(backfillUserPromptTimestamps(prior, replayed)).toEqual(replayed);
  });

  it("passes every non-user line through byte-for-byte, never round-tripped through JSON", () => {
    const line = '{"kind":"agent_message_chunk","text":"hi","extra":  1}';
    expect(backfillUserPromptTimestamps([], [line])[0]).toBe(line);
  });

  it("aligns by position across turns that predate this field, not just by whichever had a timestamp", () => {
    // Turn 1 predates the fix (no timestamp); turn 2 postdates it. A naive
    // "collect only the timestamped ones" match would shift turn 2's
    // timestamp onto turn 1.
    const prior = [
      JSON.stringify({ kind: "user_message_chunk", text: "first" }),
      JSON.stringify({
        kind: "user_message_chunk",
        text: "second",
        timestamp: "2026-09-07T19:38:00.000Z",
      }),
    ];
    const replayed = [
      JSON.stringify({ kind: "user_message_chunk", text: "first" }),
      JSON.stringify({ kind: "user_message_chunk", text: "second" }),
    ];
    const result = backfillUserPromptTimestamps(prior, replayed).map((l) =>
      JSON.parse(l),
    );
    expect(result[0].timestamp).toBeUndefined();
    expect(result[1].timestamp).toBe("2026-09-07T19:38:00.000Z");
  });

  it("is a no-op when nothing prior had a timestamp to give", () => {
    const prior = [JSON.stringify({ kind: "user_message_chunk", text: "a" })];
    const replayed = [
      JSON.stringify({ kind: "user_message_chunk", text: "a" }),
    ];
    expect(backfillUserPromptTimestamps(prior, replayed)).toEqual(replayed);
  });

  it("tolerates a corrupt prior line without throwing", () => {
    const prior = ["not json at all"];
    const replayed = [
      JSON.stringify({ kind: "user_message_chunk", text: "a" }),
    ];
    expect(() => backfillUserPromptTimestamps(prior, replayed)).not.toThrow();
  });
});

describe("createJournalWriter", () => {
  it("debounces appended lines into one whole-file write", async () => {
    const writer = createJournalWriter("ws1", "s1");
    writer.append(update("agent_message_chunk", "a"));
    writer.append(update("agent_message_chunk", "b"));
    await flush();
    // Still within the debounce window — nothing written yet.
    expect(fsWriteText).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 300));
    expect(fsWriteText).toHaveBeenCalledTimes(1);
    const [path, content] = fsWriteText.mock.calls[0];
    expect(path).toBe("/cfg/workspaces/ws1/chat-sessions/s1.jsonl");
    expect(content.trim().split("\n")).toEqual([
      JSON.stringify(update("agent_message_chunk", "a")),
      JSON.stringify(update("agent_message_chunk", "b")),
    ]);
  });

  it("flush() writes immediately and cancels the pending timer", async () => {
    const writer = createJournalWriter("ws1", "s1");
    writer.append(update("agent_message_chunk", "a"));
    await writer.flush();
    expect(fsWriteText).toHaveBeenCalledTimes(1);
  });

  it("seeds from prior lines so a resumed session keeps its history", async () => {
    const writer = createJournalWriter("ws1", "s1", ['{"kind":"old"}']);
    writer.append(update("new-kind"));
    await writer.flush();
    const content = fsWriteText.mock.calls[0][1] as string;
    expect(content.trim().split("\n")).toEqual([
      '{"kind":"old"}',
      JSON.stringify(update("new-kind")),
    ]);
  });

  it("dispose() stops further writes", async () => {
    const writer = createJournalWriter("ws1", "s1");
    writer.dispose();
    writer.append(update("a"));
    await flush();
    await new Promise((r) => setTimeout(r, 300));
    expect(fsWriteText).not.toHaveBeenCalled();
  });

  it("abandon() makes a later flush() write nothing", async () => {
    // The teardown path a session reset races: the panel's effect cleanup
    // fires `void writer.flush()` without awaiting it, well after the discard
    // has unlinked the file. `dispose()` alone leaves the buffer dirty, so
    // that flush would rewrite the whole journal and undo the clear.
    const writer = createJournalWriter("ws1", "s1");
    writer.append(update("agent_message_chunk", "a"));
    await writer.abandon();
    await writer.flush();
    writer.append(update("agent_message_chunk", "b"));
    await new Promise((r) => setTimeout(r, 300));
    expect(fsWriteText).not.toHaveBeenCalled();
  });

  it("abandon() resolves only once a write already in flight has settled", async () => {
    let release: () => void = () => {};
    fsWriteText.mockImplementationOnce(
      () =>
        new Promise<void>((r) => {
          release = () => r();
        }),
    );
    const writer = createJournalWriter("ws1", "s1");
    writer.append(update("agent_message_chunk", "a"));
    const flushing = writer.flush();
    await flush();
    let settled = false;
    const abandoning = writer.abandon().then(() => {
      settled = true;
    });
    await flush();
    // The write is still in flight — an unlink now would lose the race.
    expect(settled).toBe(false);
    release();
    await flushing;
    await abandoning;
    expect(settled).toBe(true);
  });

  it("snapshotLines() reflects appends without needing a flush", () => {
    const writer = createJournalWriter("ws1", "s1", ['{"kind":"old"}']);
    writer.append(update("new-kind"));
    expect(writer.snapshotLines()).toEqual([
      '{"kind":"old"}',
      JSON.stringify(update("new-kind")),
    ]);
  });

  it("dropSeed(n) removes the first n lines and schedules a flush", async () => {
    const writer = createJournalWriter("ws1", "s1", [
      '{"kind":"seed1"}',
      '{"kind":"seed2"}',
    ]);
    writer.append(update("replayed"));
    writer.dropSeed(2);
    expect(writer.snapshotLines()).toEqual([
      JSON.stringify(update("replayed")),
    ]);
    await writer.flush();
    expect(fsWriteText.mock.calls[0][1]).toBe(
      JSON.stringify(update("replayed")) + "\n",
    );
  });

  it("dropSeed(0) and a negative n are no-ops", () => {
    const writer = createJournalWriter("ws1", "s1", ['{"kind":"seed"}']);
    writer.dropSeed(0);
    writer.dropSeed(-1);
    expect(writer.snapshotLines()).toEqual(['{"kind":"seed"}']);
  });

  // A `dropSeed(n)` + fresh `createJournalWriter` swap (dispose the old
  // writer, construct a new one seeded with the corrected lines) reads as
  // equivalent, but a brand-new writer's own `dirty` flag starts false — its
  // `flush()` is then a no-op until something else marks it dirty, silently
  // dropping the correction from disk. `replaceLines` exists so a correction
  // (e.g. `backfillUserPromptTimestamps`) actually schedules a real write.
  it("replaceLines swaps the whole buffer and schedules a flush", async () => {
    const writer = createJournalWriter("ws1", "s1", [
      '{"kind":"seed1"}',
      '{"kind":"seed2"}',
    ]);
    writer.replaceLines([JSON.stringify(update("corrected"))]);
    expect(writer.snapshotLines()).toEqual([
      JSON.stringify(update("corrected")),
    ]);
    await writer.flush();
    expect(fsWriteText.mock.calls[0][1]).toBe(
      JSON.stringify(update("corrected")) + "\n",
    );
  });

  it("replaceLines does nothing on a disposed writer", () => {
    const writer = createJournalWriter("ws1", "s1", ['{"kind":"seed"}']);
    writer.dispose();
    writer.replaceLines(['{"kind":"new"}']);
    expect(writer.snapshotLines()).toEqual(['{"kind":"seed"}']);
  });
});

describe("pruneOrphanedChatJournals", () => {
  it("does nothing when the chat-sessions dir does not exist", async () => {
    fsPathExists.mockResolvedValue(false);
    await pruneOrphanedChatJournals("ws1", new Set());
    expect(fsReadDir).not.toHaveBeenCalled();
  });

  it("deletes an old, unreferenced journal but keeps a referenced or recent one", async () => {
    fsPathExists.mockResolvedValue(true);
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    fsReadDir.mockResolvedValue([
      {
        name: "old-orphan.jsonl",
        path: "/cfg/workspaces/ws1/chat-sessions/old-orphan.jsonl",
        isDir: false,
        size: 1,
        modifiedMs: now - 40 * day,
      },
      {
        name: "referenced.jsonl",
        path: "/cfg/workspaces/ws1/chat-sessions/referenced.jsonl",
        isDir: false,
        size: 1,
        modifiedMs: now - 40 * day,
      },
      {
        name: "recent-orphan.jsonl",
        path: "/cfg/workspaces/ws1/chat-sessions/recent-orphan.jsonl",
        isDir: false,
        size: 1,
        modifiedMs: now,
      },
      {
        name: "not-a-journal.txt",
        path: "/cfg/workspaces/ws1/chat-sessions/not-a-journal.txt",
        isDir: false,
        size: 1,
        modifiedMs: now - 40 * day,
      },
    ]);
    await pruneOrphanedChatJournals("ws1", new Set(["referenced"]), 30 * day);
    expect(fsDelete).toHaveBeenCalledTimes(1);
    expect(fsDelete).toHaveBeenCalledWith(
      "/cfg/workspaces/ws1/chat-sessions/old-orphan.jsonl",
    );
  });

  it("never throws when a delete fails", async () => {
    fsPathExists.mockResolvedValue(true);
    fsReadDir.mockResolvedValue([
      {
        name: "old.jsonl",
        path: "/x/old.jsonl",
        isDir: false,
        size: 1,
        modifiedMs: 0,
      },
    ]);
    fsDelete.mockRejectedValue(new Error("locked"));
    await expect(
      pruneOrphanedChatJournals("ws1", new Set()),
    ).resolves.toBeUndefined();
  });
});

describe("deleteJournalFile", () => {
  it("deletes the session's journal", async () => {
    fsPathExists.mockResolvedValue(true);
    await deleteJournalFile("ws1", "s1");
    expect(fsDelete).toHaveBeenCalledWith(
      "/cfg/workspaces/ws1/chat-sessions/s1.jsonl",
    );
  });

  it("is a no-op when there is no journal to delete", async () => {
    fsPathExists.mockResolvedValue(false);
    await deleteJournalFile("ws1", "s1");
    expect(fsDelete).not.toHaveBeenCalled();
  });

  it("swallows a failed unlink rather than sinking the reset", async () => {
    fsPathExists.mockResolvedValue(true);
    fsDelete.mockRejectedValueOnce(new Error("permission denied"));
    await expect(deleteJournalFile("ws1", "s1")).resolves.toBeUndefined();
  });
});
