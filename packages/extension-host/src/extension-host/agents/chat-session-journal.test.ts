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
  createJournalWriter,
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
