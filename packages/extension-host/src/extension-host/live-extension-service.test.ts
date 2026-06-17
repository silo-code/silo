// Unit tests for the live-extension watch-folder service.
// All Tauri APIs and the extension loader are mocked; the tests verify the
// boot-time loading, hot-replace, and unload paths via the file:changed event.

import { describe, it, expect, beforeEach, vi } from "vitest";

// ---- hoisted mocks (must be declared before any imports) ------------------

const { invokeMock, listenMock, loadExtMock, unloadExtMock, fsReadDirMock } =
  vi.hoisted(() => ({
    invokeMock: vi.fn(async () => {}),
    listenMock: vi.fn(async () => () => {}),
    loadExtMock: vi.fn(async () => {}),
    unloadExtMock: vi.fn(),
    fsReadDirMock: vi.fn(async () => []),
  }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }));
vi.mock("../services/user-config", () => ({
  userConfigDir: async () => "/cfg",
}));
vi.mock("../services/tauri-fs", () => ({
  fsReadDir: fsReadDirMock,
  fsCreateDir: vi.fn(async () => {}),
}));
vi.mock("./extension-loader", () => ({
  loadExtension: loadExtMock,
  unloadExtension: unloadExtMock,
}));

import { initLiveExtensions } from "./live-extension-service";

// ---- helpers ----------------------------------------------------------------

const LIVE_DIR = "/cfg/live-extensions";
const WATCH_ID = "__silo-live-extensions__";

function fakeEntry(name: string, isDir = false) {
  return { name, isDir };
}

/** Fire the file:changed listener captured by listenMock. */
async function fireFileChanged(payload: {
  watch_id: string;
  paths: string[];
  kind: string;
}) {
  // listenMock captures calls like listen("file:changed", handler)
  const handler = listenMock.mock.calls.find(
    (c) => c[0] === "file:changed",
  )?.[1] as ((e: { payload: typeof payload }) => void) | undefined;
  handler?.({ payload });
  // Allow any microtask queued by the handler to settle.
  await Promise.resolve();
}

// ---- tests ------------------------------------------------------------------

beforeEach(() => {
  invokeMock.mockClear();
  listenMock.mockClear().mockResolvedValue(() => {});
  loadExtMock.mockClear();
  unloadExtMock.mockClear();
  fsReadDirMock.mockClear().mockResolvedValue([]);
});

describe("initLiveExtensions — boot", () => {
  it("creates the watch dir and starts the watcher", async () => {
    await initLiveExtensions();
    expect(invokeMock).toHaveBeenCalledWith("start_watch", {
      watchId: WATCH_ID,
      path: LIVE_DIR,
    });
  });

  it("loads existing .js bundles found at boot", async () => {
    fsReadDirMock.mockResolvedValue([
      fakeEntry("live.tasks.js"),
      fakeEntry("live.git.js"),
    ]);

    await initLiveExtensions();

    expect(loadExtMock).toHaveBeenCalledTimes(2);
    expect(loadExtMock).toHaveBeenCalledWith({
      id: "live.tasks",
      dir: LIVE_DIR,
      main: "live.tasks.js",
      trusted: true,
    });
    expect(loadExtMock).toHaveBeenCalledWith({
      id: "live.git",
      dir: LIVE_DIR,
      main: "live.git.js",
      trusted: true,
    });
  });

  it("skips directories and non-.js files", async () => {
    fsReadDirMock.mockResolvedValue([
      fakeEntry("subdir", true),
      fakeEntry("readme.md"),
      fakeEntry("live.ok.js"),
    ]);

    await initLiveExtensions();

    expect(loadExtMock).toHaveBeenCalledTimes(1);
    expect(loadExtMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "live.ok" }),
    );
  });

  it("subscribes to file:changed events", async () => {
    await initLiveExtensions();
    expect(listenMock).toHaveBeenCalledWith(
      "file:changed",
      expect.any(Function),
    );
  });
});

describe("initLiveExtensions — file:changed events", () => {
  beforeEach(async () => {
    // Initialize once so the listener is registered.
    await initLiveExtensions();
    loadExtMock.mockClear();
    unloadExtMock.mockClear();
  });

  it("ignores events from other watch IDs", async () => {
    await fireFileChanged({
      watch_id: "other-watcher",
      paths: [`${LIVE_DIR}/live.tasks.js`],
      kind: "Create",
    });
    expect(loadExtMock).not.toHaveBeenCalled();
    expect(unloadExtMock).not.toHaveBeenCalled();
  });

  it("loads a new .js bundle on Create", async () => {
    await fireFileChanged({
      watch_id: WATCH_ID,
      paths: [`${LIVE_DIR}/live.tasks.js`],
      kind: "Create",
    });
    expect(unloadExtMock).toHaveBeenCalledWith("live.tasks");
    expect(loadExtMock).toHaveBeenCalledWith({
      id: "live.tasks",
      dir: LIVE_DIR,
      main: "live.tasks.js",
      trusted: true,
    });
  });

  it("hot-replaces (unload + reload) on Modify", async () => {
    await fireFileChanged({
      watch_id: WATCH_ID,
      paths: [`${LIVE_DIR}/live.git.js`],
      kind: "Modify",
    });
    expect(unloadExtMock).toHaveBeenCalledWith("live.git");
    expect(loadExtMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "live.git" }),
    );
  });

  it("unloads only on Remove — does not reload", async () => {
    await fireFileChanged({
      watch_id: WATCH_ID,
      paths: [`${LIVE_DIR}/live.tasks.js`],
      kind: "Remove",
    });
    expect(unloadExtMock).toHaveBeenCalledWith("live.tasks");
    expect(loadExtMock).not.toHaveBeenCalled();
  });

  it("ignores non-.js files in events", async () => {
    await fireFileChanged({
      watch_id: WATCH_ID,
      paths: [`${LIVE_DIR}/notes.md`],
      kind: "Create",
    });
    expect(loadExtMock).not.toHaveBeenCalled();
    expect(unloadExtMock).not.toHaveBeenCalled();
  });

  it("handles multiple paths in a single event", async () => {
    await fireFileChanged({
      watch_id: WATCH_ID,
      paths: [
        `${LIVE_DIR}/live.a.js`,
        `${LIVE_DIR}/live.b.js`,
        `${LIVE_DIR}/ignored.txt`,
      ],
      kind: "Create",
    });
    expect(loadExtMock).toHaveBeenCalledTimes(2);
    expect(loadExtMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "live.a" }),
    );
    expect(loadExtMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "live.b" }),
    );
  });
});
