import { describe, expect, it } from "vitest";
import type { GitStatus, GitWorktree } from "@silo-code/git-api";
import { createGitRepoTrackerRegistry } from "./repo-tracker";
import {
  createFakeClock,
  createFakeFilesWatch,
  createFakeGitApi,
  createFakeLog,
  createFakeWorkspaces,
} from "./repo-tracker.test-support";

// Flush the microtask queue a few times — enough to drain runRead's
// Promise.allSettled -> .then -> .finally chain without real timers.
async function flush() {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

// Mirrors repo-tracker.ts's own DEBOUNCE_MS (not exported — this is the
// documented, observable 400ms behavior, not an internal implementation
// detail tests should reach for directly).
const DEBOUNCE_MS = 400;

const mainWt: GitWorktree = {
  path: "/repo",
  head: "abc",
  branch: "main",
  isMain: true,
  detached: false,
  bare: false,
  locked: null,
  prunable: null,
};
const featWt: GitWorktree = {
  path: "/repo-feat",
  head: "def",
  branch: "feat",
  isMain: false,
  detached: false,
  bare: false,
  locked: null,
  prunable: null,
};
const bareWt: GitWorktree = {
  path: "/repo-bare",
  head: null,
  branch: null,
  isMain: false,
  detached: false,
  bare: true,
  locked: null,
  prunable: null,
};

describe("createGitRepoTrackerRegistry", () => {
  it("tracks a folder ambiently once its workspace opens, with no watchRepo() call", async () => {
    const api = createFakeGitApi();
    const workspaces = createFakeWorkspaces();
    const filesWatch = createFakeFilesWatch();
    createGitRepoTrackerRegistry({
      api,
      workspaces,
      filesWatch: filesWatch.watch,
    });

    workspaces.openWorkspace({ id: "w1", folder: "/repo" });
    await flush();

    expect(api.calls.status).toContain("/repo");
  });

  it("watchRepo returns the identical object for repeated calls with the same cwd", () => {
    const registry = createGitRepoTrackerRegistry({
      api: createFakeGitApi(),
      workspaces: createFakeWorkspaces(),
      filesWatch: createFakeFilesWatch().watch,
    });
    expect(registry.watchRepo("/repo")).toBe(registry.watchRepo("/repo"));
  });

  it("resolves two spellings of the same repo path (realpath vs. symlinked) to one tracker", () => {
    // e.g. a linked worktree's realpath'd `mainPath` (from GitAPI.worktrees())
    // vs. the workspace's own, possibly symlinked `ws.folder` — both must land
    // on the same tracker, not two independent fs-watchers on one directory.
    const registry = createGitRepoTrackerRegistry({
      api: createFakeGitApi(),
      workspaces: createFakeWorkspaces(),
      filesWatch: createFakeFilesWatch().watch,
    });
    expect(registry.watchRepo("/private/tmp/repo")).toBe(
      registry.watchRepo("/tmp/repo"),
    );
  });

  it("debounces an fs-watch event into a single read 400ms later", async () => {
    const api = createFakeGitApi();
    const workspaces = createFakeWorkspaces();
    const filesWatch = createFakeFilesWatch();
    const clock = createFakeClock();
    createGitRepoTrackerRegistry({
      api,
      workspaces,
      filesWatch: filesWatch.watch,
      clock,
    });
    workspaces.openWorkspace({ id: "w1", folder: "/repo" });
    await flush();
    api.calls.status.length = 0;

    filesWatch.emit("/repo");
    filesWatch.emit("/repo"); // a second event resets the debounce window
    clock.advance(399);
    await flush();
    expect(api.calls.status).toHaveLength(0);

    clock.advance(1);
    await flush();
    expect(api.calls.status).toHaveLength(1);
  });

  it("coalesces overlapping refresh() calls into one queued read, and every caller awaits that read's own result", async () => {
    const api = createFakeGitApi();
    const registry = createGitRepoTrackerRegistry({
      api,
      workspaces: createFakeWorkspaces(),
      filesWatch: createFakeFilesWatch().watch,
    });
    const store = registry.watchRepo("/repo");
    await flush(); // drain the tracker's automatic initial read

    let resolveFirst!: () => void;
    let resolveSecond!: () => void;
    let call = 0;
    api.status = () =>
      new Promise((resolve) => {
        call += 1;
        const branch = call === 1 ? "first" : "second";
        const status: GitStatus = {
          branch,
          upstream: null,
          ahead: 0,
          behind: 0,
          files: [],
          inRepo: true,
        };
        const settle = () => resolve(status);
        if (call === 1) resolveFirst = settle;
        else resolveSecond = settle;
      });

    const firstRead = store.refresh(); // starts the in-flight read
    await flush();
    const secondRead = store.refresh(); // lands while the first is in flight — coalesced

    let secondSettled = false;
    void secondRead.then(() => {
      secondSettled = true;
    });

    resolveFirst();
    await flush();
    // The stale (first) read settling must not resolve the coalesced caller —
    // only the queued follow-up read it triggers should.
    expect(secondSettled).toBe(false);
    expect(store.getState().status?.branch).toBe("first");

    resolveSecond();
    await firstRead;
    await secondRead;
    expect(secondSettled).toBe(true);
    expect(store.getState().status?.branch).toBe("second");
  });

  it("suppresses the debounced read during a mutation and refreshes exactly once after it settles", async () => {
    const api = createFakeGitApi();
    const workspaces = createFakeWorkspaces();
    const filesWatch = createFakeFilesWatch();
    const clock = createFakeClock();
    const registry = createGitRepoTrackerRegistry({
      api,
      workspaces,
      filesWatch: filesWatch.watch,
      clock,
    });
    workspaces.openWorkspace({ id: "w1", folder: "/repo" });
    await flush();
    const store = registry.watchRepo("/repo");
    api.calls.status.length = 0;

    const commitPromise = store.commit("msg");
    filesWatch.emit("/repo"); // simulate a pre-commit hook touching .git mid-commit
    clock.advance(10_000); // well past the debounce window — must not fire a
    // *separate* read on top of the mutation's own trailing refresh
    await commitPromise;
    await flush();

    expect(api.calls.status).toHaveLength(1);
  });

  it("serializes mutating calls on the same store", async () => {
    const api = createFakeGitApi();
    const order: string[] = [];
    api.stage = async () => {
      order.push("stage start");
      await Promise.resolve();
      order.push("stage end");
    };
    api.commit = async () => {
      order.push("commit start");
      await Promise.resolve();
      order.push("commit end");
    };
    const registry = createGitRepoTrackerRegistry({
      api,
      workspaces: createFakeWorkspaces(),
      filesWatch: createFakeFilesWatch().watch,
    });
    const store = registry.watchRepo("/repo");

    const p1 = store.stage(["a.txt"]);
    const p2 = store.commit("msg");
    await Promise.all([p1, p2]);

    expect(order).toEqual([
      "stage start",
      "stage end",
      "commit start",
      "commit end",
    ]);
  });

  it("autofetches only the active workspace's folder, on the 180s cadence", async () => {
    const api = createFakeGitApi();
    const workspaces = createFakeWorkspaces();
    const filesWatch = createFakeFilesWatch();
    const clock = createFakeClock();
    createGitRepoTrackerRegistry({
      api,
      workspaces,
      filesWatch: filesWatch.watch,
      clock,
    });
    workspaces.openWorkspace({ id: "w1", folder: "/active" });
    workspaces.openWorkspace({ id: "w2", folder: "/background" });
    workspaces.setActive("w1");
    await flush();
    api.calls.fetch.length = 0;

    clock.advance(180_000);
    await flush();
    expect(api.calls.fetch).toEqual(["/active"]);

    workspaces.setActive("w2");
    await flush();
    api.calls.fetch.length = 0;

    clock.advance(180_000);
    await flush();
    expect(api.calls.fetch).toEqual(["/background"]);
  });

  it("skips an autofetch tick for a path mid `git worktree remove`, not just the trailing read", async () => {
    const api = createFakeGitApi();
    let resolveRemove!: () => void;
    api.removeWorktree = () =>
      new Promise((resolve) => {
        resolveRemove = () => resolve();
      });
    const workspaces = createFakeWorkspaces();
    const clock = createFakeClock();
    const registry = createGitRepoTrackerRegistry({
      api,
      workspaces,
      filesWatch: createFakeFilesWatch().watch,
      clock,
    });
    // The linked worktree being removed has its own tracker (e.g. opened as
    // its own workspace folder) and is in the active workspace, so it
    // autofetches too.
    workspaces.openWorkspace({
      id: "w1",
      folder: "/main",
      extraFolders: ["/main-feat"],
    });
    workspaces.setActive("w1");
    await flush();
    const mainStore = registry.watchRepo("/main");
    api.calls.fetch.length = 0;

    const removePromise = mainStore.removeWorktree("/main-feat");
    await flush();

    clock.advance(180_000);
    await flush();
    expect(api.calls.fetch).not.toContain("/main-feat");
    expect(api.calls.fetch).toContain("/main");

    resolveRemove();
    await removePromise;
  });

  it("logs an autofetch failure instead of swallowing it silently", async () => {
    const api = createFakeGitApi();
    api.fetch = () => Promise.reject(new Error("no route to host"));
    const workspaces = createFakeWorkspaces();
    const clock = createFakeClock();
    const log = createFakeLog();
    createGitRepoTrackerRegistry({
      api,
      workspaces,
      filesWatch: createFakeFilesWatch().watch,
      clock,
      log,
    });
    workspaces.openWorkspace({ id: "w1", folder: "/repo" });
    workspaces.setActive("w1");
    await flush();
    log.lines.length = 0;

    clock.advance(180_000);
    await flush();
    expect(log.lines.some((l) => l.includes("/repo"))).toBe(true);
  });

  it("fires onWorktreeAdded/onWorktreeRemoved on diff, excluding bare entries from added", async () => {
    const api = createFakeGitApi();
    const workspaces = createFakeWorkspaces();
    const filesWatch = createFakeFilesWatch();
    const registry = createGitRepoTrackerRegistry({
      api,
      workspaces,
      filesWatch: filesWatch.watch,
    });
    workspaces.openWorkspace({ id: "w1", folder: "/repo" });
    await flush();
    const store = registry.watchRepo("/repo");
    const added: GitWorktree[] = [];
    const removed: GitWorktree[] = [];
    store.onWorktreeAdded((wt) => added.push(wt));
    store.onWorktreeRemoved((wt) => removed.push(wt));

    api.setWorktrees("/repo", [mainWt]);
    await store.refresh(); // second read overall — diffs against the ambient initial read's [] baseline, so mainWt reads as "added" once
    await flush();
    added.length = 0;
    removed.length = 0;

    api.setWorktrees("/repo", [mainWt, featWt, bareWt]);
    await store.refresh();
    await flush();
    expect(added.map((w) => w.path)).toEqual(["/repo-feat"]);

    api.setWorktrees("/repo", [mainWt]);
    await store.refresh();
    await flush();
    expect(removed.map((w) => w.path).sort()).toEqual([
      "/repo-bare",
      "/repo-feat",
    ]);
  });

  it("does not fire onWorktreeAdded for pre-existing worktrees on a tracker's very first read (cold start)", async () => {
    // Regression test: a repo that already has linked worktrees (the common
    // case — this is what a real, already-in-use repo looks like) must not
    // toast "new worktree" for every one of them the instant Silo starts
    // tracking it. Caught live: without this guard, every pre-existing
    // worktree across every already-open real workspace fired a "was
    // created" notification the moment the app picked up this code.
    const api = createFakeGitApi();
    const workspaces = createFakeWorkspaces();
    const filesWatch = createFakeFilesWatch();
    // Worktrees already exist *before* the workspace (and therefore the
    // tracker) is ever opened — the exact shape of an app cold start against
    // a repo someone's already been using.
    api.setWorktrees("/repo", [mainWt, featWt]);
    const registry = createGitRepoTrackerRegistry({
      api,
      workspaces,
      filesWatch: filesWatch.watch,
    });
    const store = registry.watchRepo("/repo");
    const added: GitWorktree[] = [];
    store.onWorktreeAdded((wt) => added.push(wt));

    workspaces.openWorkspace({ id: "w1", folder: "/repo" }); // triggers the tracker's one automatic initial read
    await flush();

    expect(added).toEqual([]);
    expect(store.getState().worktrees).toEqual([mainWt, featWt]);
  });

  it("fires onFolderMissing edge-triggered — once on the transition, again if it recurs", async () => {
    const api = createFakeGitApi();
    const workspaces = createFakeWorkspaces();
    const filesWatch = createFakeFilesWatch();
    const registry = createGitRepoTrackerRegistry({
      api,
      workspaces,
      filesWatch: filesWatch.watch,
    });
    workspaces.openWorkspace({ id: "w1", folder: "/repo" });
    await flush();
    const store = registry.watchRepo("/repo");
    let fired = 0;
    store.onFolderMissing(() => fired++);

    api.setStatus("/repo", {
      branch: null,
      upstream: null,
      ahead: 0,
      behind: 0,
      files: [],
      inRepo: false,
      missing: true,
    });
    await store.refresh();
    await flush();
    expect(fired).toBe(1);

    await store.refresh(); // still missing — no refire
    await flush();
    expect(fired).toBe(1);

    api.setStatus("/repo", {
      branch: "main",
      upstream: null,
      ahead: 0,
      behind: 0,
      files: [],
      inRepo: true,
    });
    await store.refresh();
    await flush();
    api.setStatus("/repo", {
      branch: null,
      upstream: null,
      ahead: 0,
      behind: 0,
      files: [],
      inRepo: false,
      missing: true,
    });
    await store.refresh();
    await flush();
    expect(fired).toBe(2);
  });

  it("skips reads for a path while another tracker is removing it as a worktree", async () => {
    const api = createFakeGitApi();
    let resolveRemove!: () => void;
    api.removeWorktree = () =>
      new Promise((resolve) => {
        resolveRemove = () => resolve();
      });
    const registry = createGitRepoTrackerRegistry({
      api,
      workspaces: createFakeWorkspaces(),
      filesWatch: createFakeFilesWatch().watch,
    });
    const mainStore = registry.watchRepo("/main");
    const targetStore = registry.watchRepo("/main-feat");
    await flush();
    api.calls.status.length = 0;

    const removePromise = mainStore.removeWorktree("/main-feat");
    await targetStore.refresh();
    await flush();
    expect(api.calls.status).not.toContain("/main-feat");

    resolveRemove();
    await removePromise;
  });

  it("tears down a tracker's fs-watch once its workspace closes and nothing else references it", async () => {
    const api = createFakeGitApi();
    const workspaces = createFakeWorkspaces();
    const filesWatch = createFakeFilesWatch();
    const clock = createFakeClock();
    createGitRepoTrackerRegistry({
      api,
      workspaces,
      filesWatch: filesWatch.watch,
      clock,
    });
    workspaces.openWorkspace({ id: "w1", folder: "/repo" });
    await flush();

    workspaces.closeWorkspace("w1");
    await flush();
    api.calls.status.length = 0;

    filesWatch.emit("/repo"); // no-op: the listener was disposed on teardown
    clock.advance(DEBOUNCE_MS);
    await flush();
    expect(api.calls.status).toHaveLength(0);
  });

  it("an active subscriber keeps a tracker alive after its workspace closes, until it unsubscribes", async () => {
    // Lifecycle is tied to subscriptions, not to how many times watchRepo()
    // was called — watchRepo() is safe to call every render without
    // useMemo, so it must not be what keeps a tracker alive on its own.
    const api = createFakeGitApi();
    const workspaces = createFakeWorkspaces();
    const filesWatch = createFakeFilesWatch();
    const clock = createFakeClock();
    const registry = createGitRepoTrackerRegistry({
      api,
      workspaces,
      filesWatch: filesWatch.watch,
      clock,
    });
    workspaces.openWorkspace({ id: "w1", folder: "/repo" });
    await flush();
    const external = registry.watchRepo("/repo");
    const sub = external.subscribe(() => {});

    workspaces.closeWorkspace("w1");
    await flush();
    api.calls.status.length = 0;
    filesWatch.emit("/repo");
    clock.advance(DEBOUNCE_MS);
    await flush();
    expect(api.calls.status).toHaveLength(1);

    sub.dispose();
    await flush();
    api.calls.status.length = 0;
    filesWatch.emit("/repo");
    clock.advance(DEBOUNCE_MS);
    await flush();
    expect(api.calls.status).toHaveLength(0);
  });

  it("a stale store's dispose() can't delete a tracker already recreated for the same cwd", async () => {
    // Mirrors a deferred cleanup arriving late (e.g. a second, independent
    // workspaces subscriber calling store.dispose() on its own schedule):
    // the tracker it holds a reference to may already have been superseded
    // by a fresh one for the same path by the time dispose() actually runs.
    const workspaces = createFakeWorkspaces();
    const registry = createGitRepoTrackerRegistry({
      api: createFakeGitApi(),
      workspaces,
      filesWatch: createFakeFilesWatch().watch,
    });
    const staleStore = registry.watchRepo("/repo"); // unowned, floating tracker
    await flush();

    workspaces.openWorkspace({ id: "w1", folder: "/repo" });
    await flush();
    workspaces.closeWorkspace("w1"); // reconcile tears the floating tracker down
    await flush();

    workspaces.openWorkspace({ id: "w2", folder: "/repo" }); // a fresh tracker
    await flush();
    const freshStore = registry.watchRepo("/repo");
    expect(freshStore).not.toBe(staleStore);

    staleStore.dispose(); // the stale cleanup, arriving after the fact
    await flush();

    // Still the live tracker for the open workspace — not deleted out from
    // under it by the stale dispose().
    expect(registry.watchRepo("/repo")).toBe(freshStore);
  });

  it("calling watchRepo() repeatedly for a non-workspace cwd doesn't leak — an unsubscribed, never-referenced tracker tears down on the next reconcile", async () => {
    const api = createFakeGitApi();
    const workspaces = createFakeWorkspaces();
    const filesWatch = createFakeFilesWatch();
    const registry = createGitRepoTrackerRegistry({
      api,
      workspaces,
      filesWatch: filesWatch.watch,
    });

    // Simulates a component calling watchRepo() on every render with no
    // useMemo — must not accumulate any hidden "keep alive" count.
    for (let i = 0; i < 50; i++) registry.watchRepo("/outside-any-workspace");
    await flush();

    // An unrelated workspace-state change forces a reconcile pass; with no
    // subscriber and no workspace ownership, the tracker should be gone —
    // not kept alive by the 50 prior watchRepo() calls.
    workspaces.openWorkspace({ id: "w1", folder: "/unrelated" });
    await flush();
    api.calls.status.length = 0;
    filesWatch.emit("/outside-any-workspace");
    await flush();
    expect(api.calls.status).toHaveLength(0);
  });

  describe("debugSnapshot", () => {
    it("reports exactly the currently-live trackers, with why each is alive", async () => {
      const api = createFakeGitApi();
      const workspaces = createFakeWorkspaces();
      const filesWatch = createFakeFilesWatch();
      const registry = createGitRepoTrackerRegistry({
        api,
        workspaces,
        filesWatch: filesWatch.watch,
      });
      workspaces.openWorkspace({ id: "w1", folder: "/active" });
      workspaces.openWorkspace({ id: "w2", folder: "/background" });
      workspaces.setActive("w1");
      await flush();

      const store = registry.watchRepo("/background");
      const sub = store.subscribe(() => {});

      const snapshot = registry.debugSnapshot();
      expect(snapshot.map((t) => t.cwd).sort()).toEqual([
        "/active",
        "/background",
      ]);
      const active = snapshot.find((t) => t.cwd === "/active")!;
      const background = snapshot.find((t) => t.cwd === "/background")!;
      expect(active).toMatchObject({
        workspaceOwned: true,
        subscriberCount: 0,
        autofetching: true,
      });
      expect(background).toMatchObject({
        workspaceOwned: true,
        subscriberCount: 1,
        autofetching: false,
      });

      sub.dispose();
      workspaces.closeWorkspace("w2");
      await flush();

      expect(registry.debugSnapshot().map((t) => t.cwd)).toEqual(["/active"]);
    });

    it("stays empty when nothing is tracked — the baseline for a fresh app", () => {
      const registry = createGitRepoTrackerRegistry({
        api: createFakeGitApi(),
        workspaces: createFakeWorkspaces(),
        filesWatch: createFakeFilesWatch().watch,
      });
      expect(registry.debugSnapshot()).toEqual([]);
    });
  });

  it("logs tracker start/stop at debug level, for a passive audit trail over long-running sessions", async () => {
    const api = createFakeGitApi();
    const workspaces = createFakeWorkspaces();
    const filesWatch = createFakeFilesWatch();
    const log = createFakeLog();
    createGitRepoTrackerRegistry({
      api,
      workspaces,
      filesWatch: filesWatch.watch,
      log,
    });

    workspaces.openWorkspace({ id: "w1", folder: "/repo" });
    await flush();
    expect(log.lines.some((l) => l.includes("started tracking /repo"))).toBe(
      true,
    );

    workspaces.closeWorkspace("w1");
    await flush();
    expect(log.lines.some((l) => l.includes("stopped tracking /repo"))).toBe(
      true,
    );
  });
});
