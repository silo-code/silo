import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock at the Tauri boundary so the test exercises the real tauri-fs /
// tauri-watch wrappers *and* the FileService factory together — the contract
// plus its wiring. `vi.hoisted` is required: the mocked modules load (via the
// `./file-service` import below) before top-level const initializers run.
const { invoke, listen, unlisten, fireChange } = vi.hoisted(() => {
  let handler: ((e: { payload: unknown }) => void) | null = null;
  const unlisten = vi.fn();
  return {
    invoke: vi.fn(),
    listen: vi.fn(
      async (_event: string, cb: (e: { payload: unknown }) => void) => {
        handler = cb;
        return unlisten;
      },
    ),
    unlisten,
    fireChange: (payload: unknown) => handler?.({ payload }),
  };
});

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen }));
vi.mock("../services/user-config", () => ({
  userConfigDir: async () => "/cfg",
}));

import { PathDeniedError } from "@silo-code/sdk";
import { getFileService, scopeFileService } from "./file-service";
import {
  initStorageRoot,
  resetStorageRootForTests,
} from "./extension-storage-dirs";

const files = getFileService();

// Flush pending micro/macrotasks — `watch` subscribes through an async
// `onFileChange` wrapper before it captures its unlisten fn.
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue(undefined);
  listen.mockClear();
  unlisten.mockClear();
});

describe("FileService — reads & writes", () => {
  it("readText reads UTF-8 text via fs_read_text", async () => {
    invoke.mockResolvedValueOnce("hello");
    await expect(files.readText("/a.txt")).resolves.toBe("hello");
    expect(invoke).toHaveBeenCalledWith("fs_read_text", { path: "/a.txt" });
  });

  it("writeText writes content via fs_write_text", async () => {
    await files.writeText("/a.txt", "body");
    expect(invoke).toHaveBeenCalledWith("fs_write_text", {
      path: "/a.txt",
      content: "body",
    });
  });

  it("pathExists returns the backend boolean", async () => {
    invoke.mockResolvedValueOnce(true);
    await expect(files.pathExists("/a.txt")).resolves.toBe(true);
    expect(invoke).toHaveBeenCalledWith("fs_path_exists", { path: "/a.txt" });
  });

  it("readBytes / createDir / rename / delete / reveal hit the right commands", async () => {
    await files.readBytes("/img.png");
    await files.createDir("/dir");
    await files.rename("/old", "/new");
    await files.delete("/gone");
    await files.reveal("/show");
    expect(invoke).toHaveBeenCalledWith("fs_read_bytes", { path: "/img.png" });
    expect(invoke).toHaveBeenCalledWith("fs_create_dir", { path: "/dir" });
    expect(invoke).toHaveBeenCalledWith("fs_rename", {
      oldPath: "/old",
      newPath: "/new",
    });
    expect(invoke).toHaveBeenCalledWith("fs_delete", { path: "/gone" });
    expect(invoke).toHaveBeenCalledWith("fs_reveal", { path: "/show" });
  });

  it("readDir maps the backend's snake_case entries to FileMeta", async () => {
    invoke.mockResolvedValueOnce([
      { name: "f.ts", path: "/f.ts", is_dir: false, size: 12, modified_ms: 99 },
    ]);
    await expect(files.readDir("/")).resolves.toEqual([
      { name: "f.ts", path: "/f.ts", isDir: false, size: 12, modifiedMs: 99 },
    ]);
  });

  // ── B8: writeBytes / copy / stat ──────────────────────────────────────────

  it("writeBytes sends a plain number array to fs_write_bytes (Uint8Array)", async () => {
    await files.writeBytes("/b.bin", new Uint8Array([1, 2, 255]));
    expect(invoke).toHaveBeenCalledWith("fs_write_bytes", {
      path: "/b.bin",
      data: [1, 2, 255],
    });
  });

  it("writeBytes accepts an ArrayBuffer", async () => {
    const buf = new Uint8Array([7, 8]).buffer;
    await files.writeBytes("/b.bin", buf);
    expect(invoke).toHaveBeenCalledWith("fs_write_bytes", {
      path: "/b.bin",
      data: [7, 8],
    });
  });

  it("copy passes src/dst to fs_copy", async () => {
    await files.copy("/src/dir", "/dst/dir");
    expect(invoke).toHaveBeenCalledWith("fs_copy", {
      src: "/src/dir",
      dst: "/dst/dir",
    });
  });

  it("stat maps a FileMeta and returns null for an absent path", async () => {
    invoke.mockResolvedValueOnce({
      name: "a.ts",
      path: "/a.ts",
      is_dir: false,
      size: 5,
      modified_ms: 42,
    });
    await expect(files.stat("/a.ts")).resolves.toEqual({
      name: "a.ts",
      path: "/a.ts",
      isDir: false,
      size: 5,
      modifiedMs: 42,
    });
    invoke.mockResolvedValueOnce(null);
    await expect(files.stat("/missing")).resolves.toBeNull();
  });
});

describe("FileService — scope wrapper (B8)", () => {
  it("copy checks src as read and dest as write", async () => {
    const scope = {
      roots: ["/ws"],
      ownDirs: [],
      trusted: false,
      permissions: new Set<never>(),
    };
    const scoped = scopeFileService(files, scope);
    // In-workspace relative paths resolve against the root; out-of-workspace
    // writes without fs:write are denied.
    await scoped.copy("a.txt", "b.txt");
    expect(invoke).toHaveBeenCalledWith("fs_copy", {
      src: "/ws/a.txt",
      dst: "/ws/b.txt",
    });
    await expect(scoped.copy("a.txt", "/etc/passwd")).rejects.toBeInstanceOf(
      PathDeniedError,
    );
  });
});

// Capture the watchId the host minted for the most recent start_watch call.
const lastWatchId = (): string => {
  const starts = invoke.mock.calls.filter((c) => c[0] === "start_watch");
  return starts[starts.length - 1][1].watchId;
};

// The watch registry is module-level shared state, so each test uses a unique
// path to avoid ref-count sharing leaking across tests.
const stops = (watchId?: string) =>
  invoke.mock.calls.filter(
    (c) => c[0] === "stop_watch" && (!watchId || c[1].watchId === watchId),
  );
const startsFor = (path: string) =>
  invoke.mock.calls.filter((c) => c[0] === "start_watch" && c[1].path === path);

// RFC 0032 — the project-tree noise filter is a workspace concern; inside an
// extension's own storage directory the host turns it off, so a subfolder the
// extension named `cache/` still delivers events.
describe("FileService — watch noise filtering", () => {
  beforeEach(() => resetStorageRootForTests());

  it("keeps the filter on for a workspace path", async () => {
    await initStorageRoot();
    const handle = files.watch("/work/project", () => {});
    await flush();
    expect(invoke).toHaveBeenCalledWith(
      "start_watch",
      expect.objectContaining({ path: "/work/project", filterNoise: true }),
    );
    handle.dispose();
  });

  it("turns the filter off inside the extension-storage root", async () => {
    await initStorageRoot();
    const path = "/cfg/extension-storage/acme.hello/global";
    const handle = files.watch(path, () => {});
    await flush();
    expect(invoke).toHaveBeenCalledWith(
      "start_watch",
      expect.objectContaining({ path, filterNoise: false }),
    );
    handle.dispose();
  });
});

describe("FileService — watch", () => {
  it("starts a backend watch on the path and stops it on dispose", async () => {
    const handle = files.watch("/w-basic", () => {});
    await flush();
    expect(invoke).toHaveBeenCalledWith(
      "start_watch",
      expect.objectContaining({ path: "/w-basic" }),
    );
    const watchId = lastWatchId();

    handle.dispose();
    await flush();
    expect(invoke).toHaveBeenCalledWith("stop_watch", { watchId });
  });

  it("delivers {paths, kind} for its own events, dropping watchId", async () => {
    const seen: unknown[] = [];
    const handle = files.watch("/w-deliver", (e) => seen.push(e));
    await flush();

    fireChange({ watch_id: lastWatchId(), paths: ["/a.txt"], kind: "modify" });
    expect(seen).toEqual([{ paths: ["/a.txt"], kind: "modify" }]);
    handle.dispose();
  });

  it("normalizes raw backend kinds to the closed FileChangeKind union", async () => {
    const seen: string[] = [];
    const handle = files.watch("/w-kinds", (e) => seen.push(e.kind));
    await flush();
    const watchId = lastWatchId();

    // notify-rs style debug strings, mixed case — anything the backend emits
    // must land on the closed union, with "other" as the fallback.
    fireChange({ watch_id: watchId, paths: ["/a"], kind: "Create(File)" });
    fireChange({
      watch_id: watchId,
      paths: ["/b"],
      kind: "MODIFY(Data(Content))",
    });
    fireChange({ watch_id: watchId, paths: ["/c"], kind: "remove(folder)" });
    fireChange({ watch_id: watchId, paths: ["/d"], kind: "access" });
    fireChange({ watch_id: watchId, paths: ["/e"], kind: "any" });

    expect(seen).toEqual(["create", "modify", "remove", "other", "other"]);
    handle.dispose();
  });

  it("ignores events from other watches (scoped by watchId)", async () => {
    const seen: unknown[] = [];
    const handle = files.watch("/w-scope", (e) => seen.push(e));
    await flush();

    fireChange({ watch_id: "someone-else", paths: ["/x"], kind: "modify" });
    expect(seen).toEqual([]);
    handle.dispose();
  });

  it("dispose is idempotent (stop_watch fires once) and unsubscribes", async () => {
    const handle = files.watch("/w-idem", () => {});
    await flush();
    handle.dispose();
    handle.dispose();
    await flush();
    expect(stops()).toHaveLength(1);
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("each distinct path gets a distinct id", async () => {
    const a = files.watch("/w-a", () => {});
    const b = files.watch("/w-b", () => {});
    await flush();
    const ids = invoke.mock.calls
      .filter((c) => c[0] === "start_watch")
      .map((c) => c[1].watchId);
    expect(new Set(ids).size).toBe(ids.length);
    a.dispose();
    b.dispose();
  });

  it("tears down even when disposed before listen resolves", async () => {
    const handle = files.watch("/w-early", () => {});
    handle.dispose(); // before the listen() promise settles
    await flush();
    expect(unlisten).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(
      "stop_watch",
      expect.objectContaining({ watchId: expect.any(String) }),
    );
  });

  it("ref-counts: one backend watcher per path, stopped only when the last subscriber leaves", async () => {
    const seenA: unknown[] = [];
    const seenB: unknown[] = [];
    const a = files.watch("/w-shared", (e) => seenA.push(e));
    const b = files.watch("/w-shared", (e) => seenB.push(e));
    await flush();

    // one backend watcher despite two subscribers
    expect(startsFor("/w-shared")).toHaveLength(1);
    const watchId = startsFor("/w-shared")[0][1].watchId;

    // both listeners receive the event
    fireChange({ watch_id: watchId, paths: ["/w-shared/x"], kind: "create" });
    expect(seenA).toHaveLength(1);
    expect(seenB).toHaveLength(1);

    // disposing one keeps the watcher alive for the other
    a.dispose();
    await flush();
    expect(stops(watchId)).toHaveLength(0);
    fireChange({ watch_id: watchId, paths: ["/w-shared/y"], kind: "modify" });
    expect(seenA).toHaveLength(1); // a no longer notified
    expect(seenB).toHaveLength(2);

    // last subscriber leaving stops the backend watcher once
    b.dispose();
    await flush();
    expect(stops(watchId)).toHaveLength(1);
  });
});
