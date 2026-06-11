import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// The Tauri fs boundary is mocked; `invoke` is hoisted so the vi.mock factory
// can reference it. Fake timers keep the write-debounce from auto-firing — every
// test drives the lifecycle explicitly (flush/clear), so a stray debounce tick
// can't leak `invoke` calls across tests.
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

// Fresh module per test so the in-memory `pending` map and `backupDir` reset.
async function load() {
  vi.resetModules();
  return import("./editor-backups");
}

beforeEach(() => {
  vi.useFakeTimers();
  invoke.mockReset();
  invoke.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("resolveRestoredBuffer", () => {
  it("restores a backup that differs from disk as dirty", async () => {
    const { resolveRestoredBuffer } = await load();
    expect(
      resolveRestoredBuffer({ diskText: "on disk", backup: "edited" }),
    ).toEqual({ content: "edited", dirty: true });
  });

  it("ignores a backup equal to disk (clean)", async () => {
    const { resolveRestoredBuffer } = await load();
    expect(resolveRestoredBuffer({ diskText: "same", backup: "same" })).toEqual(
      { content: "same", dirty: false },
    );
  });

  it("uses disk text when there is no backup", async () => {
    const { resolveRestoredBuffer } = await load();
    expect(resolveRestoredBuffer({ diskText: "disk", backup: null })).toEqual({
      content: "disk",
      dirty: false,
    });
  });

  it("restores an untitled backup (no disk) as dirty", async () => {
    const { resolveRestoredBuffer } = await load();
    expect(resolveRestoredBuffer({ diskText: null, backup: "typed" })).toEqual({
      content: "typed",
      dirty: true,
    });
  });

  it("treats an empty untitled buffer as clean", async () => {
    const { resolveRestoredBuffer } = await load();
    expect(resolveRestoredBuffer({ diskText: null, backup: "" })).toEqual({
      content: "",
      dirty: false,
    });
  });
});

describe("orphanBackupIds", () => {
  it("returns ids whose editor is not live, ignoring non-json entries", async () => {
    const { orphanBackupIds } = await load();
    const out = orphanBackupIds(
      ["ed_a.json", "ed_b.json", "notes.txt", "ed_c.json"],
      new Set(["ed_b"]),
    );
    expect(out.sort()).toEqual(["ed_a", "ed_c"]);
  });

  it("returns nothing when every backup is live", async () => {
    const { orphanBackupIds } = await load();
    expect(orphanBackupIds(["ed_a.json"], new Set(["ed_a"]))).toEqual([]);
  });
});

describe("backup lifecycle", () => {
  it("no-ops until the backup dir is set", async () => {
    const { setEditorBackup, flushEditorBackups } = await load();
    setEditorBackup("ed_1", "/f", "hi");
    await flushEditorBackups();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("flush writes the latest content to <dir>/<id>.json, once per editor", async () => {
    const { setBackupDir, setEditorBackup, flushEditorBackups } = await load();
    setBackupDir("/cfg/silo");
    setEditorBackup("ed_1", "/f.ts", "v1");
    setEditorBackup("ed_1", "/f.ts", "v2"); // newest content wins
    await flushEditorBackups();
    expect(invoke).toHaveBeenCalledWith("fs_write_text", {
      path: "/cfg/silo/backups/ed_1.json",
      content: JSON.stringify({ filePath: "/f.ts", content: "v2" }),
    });
    const writes = invoke.mock.calls.filter((c) => c[0] === "fs_write_text");
    expect(writes).toHaveLength(1);
  });

  it("clear deletes the file and drops the entry from the flush set", async () => {
    const {
      setBackupDir,
      setEditorBackup,
      clearEditorBackup,
      flushEditorBackups,
    } = await load();
    setBackupDir("/cfg");
    setEditorBackup("ed_2", null, "typed");
    await clearEditorBackup("ed_2");
    expect(invoke).toHaveBeenCalledWith("fs_delete", {
      path: "/cfg/backups/ed_2.json",
    });
    invoke.mockClear();
    await flushEditorBackups();
    expect(invoke).not.toHaveBeenCalled(); // nothing left to write
  });

  it("read returns the parsed backup, or null when absent/unreadable", async () => {
    const { setBackupDir, readEditorBackup } = await load();
    setBackupDir("/cfg");
    invoke.mockResolvedValueOnce(
      JSON.stringify({ filePath: "/a", content: "x" }),
    );
    await expect(readEditorBackup("ed_3")).resolves.toEqual({
      filePath: "/a",
      content: "x",
    });
    invoke.mockRejectedValueOnce(new Error("ENOENT"));
    await expect(readEditorBackup("ed_3")).resolves.toBeNull();
  });

  it("read prefers the freshest in-memory content over the file", async () => {
    const { setBackupDir, setEditorBackup, readEditorBackup } = await load();
    setBackupDir("/cfg");
    setEditorBackup("ed_4", "/f.ts", "freshest"); // not flushed to disk yet
    await expect(readEditorBackup("ed_4")).resolves.toEqual({
      filePath: "/f.ts",
      content: "freshest",
    });
    // The file is never touched when the in-memory entry is present.
    expect(invoke).not.toHaveBeenCalledWith("fs_read_text", expect.anything());
  });

  it("sweep deletes only the orphaned backup files", async () => {
    const { setBackupDir, sweepEditorBackups } = await load();
    setBackupDir("/cfg");
    invoke.mockImplementation((cmd: string) => {
      if (cmd === "fs_read_dir")
        return Promise.resolve([
          { name: "ed_live.json", is_dir: false },
          { name: "ed_dead.json", is_dir: false },
          { name: "sub", is_dir: true },
        ]);
      return Promise.resolve(undefined);
    });
    await sweepEditorBackups(new Set(["ed_live"]));
    const deletes = invoke.mock.calls.filter((c) => c[0] === "fs_delete");
    expect(deletes).toEqual([
      ["fs_delete", { path: "/cfg/backups/ed_dead.json" }],
    ]);
  });
});

describe("I/O serialization + durability", () => {
  it("runs a clear's delete after an in-flight write (no resurrection)", async () => {
    const {
      setBackupDir,
      setEditorBackup,
      clearEditorBackup,
      flushEditorBackups,
    } = await load();
    setBackupDir("/cfg");
    const order: string[] = [];
    let releaseWrite!: () => void;
    const writeGate = new Promise<void>((r) => {
      releaseWrite = r;
    });
    invoke.mockImplementation((cmd: string) => {
      if (cmd === "fs_write_text")
        return writeGate.then(() => {
          order.push("write");
        });
      if (cmd === "fs_delete") {
        order.push("delete");
        return Promise.resolve();
      }
      return Promise.resolve();
    });
    setEditorBackup("ed_x", "/f", "v1");
    const flushP = flushEditorBackups(); // enqueues the write (gated, in-flight)
    const clearP = clearEditorBackup("ed_x"); // enqueues the delete behind it
    releaseWrite(); // let the write finish
    await Promise.all([flushP, clearP]);
    // Delete ran AFTER the write — so the file ends deleted, not resurrected.
    expect(order).toEqual(["write", "delete"]);
  });

  it("does not reset the flush timer per edit, so no editor is starved", async () => {
    const { setBackupDir, setEditorBackup } = await load();
    setBackupDir("/cfg");
    invoke.mockResolvedValue(undefined);
    setEditorBackup("ed_a", "/a", "a1"); // schedules a flush ~600ms out
    await vi.advanceTimersByTimeAsync(300);
    setEditorBackup("ed_b", "/b", "b1"); // must NOT push the flush out
    await vi.advanceTimersByTimeAsync(300); // 600ms after the first edit
    const writes = invoke.mock.calls
      .filter((c) => c[0] === "fs_write_text")
      .map((c) => (c[1] as { path: string }).path);
    // The single window flushed both editors (a reset timer would have written neither yet).
    expect(writes).toContain("/cfg/backups/ed_a.json");
    expect(writes).toContain("/cfg/backups/ed_b.json");
  });

  it("retries a failed write on the next debounce window", async () => {
    const { setBackupDir, setEditorBackup, flushEditorBackups } = await load();
    setBackupDir("/cfg");
    invoke.mockRejectedValueOnce(new Error("disk full")); // first write fails
    invoke.mockResolvedValue(undefined);
    setEditorBackup("ed_y", "/f", "v1");
    await flushEditorBackups(); // write fails → entry retained + timer re-armed
    await vi.advanceTimersByTimeAsync(600); // re-armed flush fires and retries
    expect(invoke).toHaveBeenCalledWith("fs_write_text", {
      path: "/cfg/backups/ed_y.json",
      content: JSON.stringify({ filePath: "/f", content: "v1" }),
    });
  });
});
