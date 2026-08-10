import type { ExtensionContext } from "@silo-code/sdk";
import { describe, it, expect, vi } from "vitest";
import { notifyMissingFolder } from "./notify-missing-folder";

function mockCtx(ws: { folder: string; extraFolders?: string[] } | undefined): {
  ctx: ExtensionContext;
  notify: ReturnType<typeof vi.fn>;
  removeFolder: ReturnType<typeof vi.fn>;
} {
  const notify = vi.fn();
  const removeFolder = vi.fn();
  const ctx = {
    ui: { notify },
    workspaces: { get: () => ws, removeFolder },
  } as unknown as ExtensionContext;
  return { ctx, notify, removeFolder };
}

// The de-dup set is module-level (session-lifetime), so each test uses a
// distinct workspace id to avoid cross-test interference.
let wsCounter = 0;
function wsId(): string {
  wsCounter += 1;
  return `ws${wsCounter}`;
}

describe("notifyMissingFolder", () => {
  it("notifies for a missing extra folder, offering to remove it", () => {
    const id = wsId();
    const { ctx, notify, removeFolder } = mockCtx({
      folder: "/w/repo",
      extraFolders: ["/w/repo-b"],
    });

    notifyMissingFolder(ctx, id, "/w/repo-b", true);

    expect(notify).toHaveBeenCalledWith(
      "warn",
      '"repo-b" could not be found. Remove it from the workspace?',
      expect.objectContaining({ title: "Workspace folder not found" }),
    );

    const options = notify.mock.calls[0]![2];
    options.actions[0].run();
    expect(removeFolder).toHaveBeenCalledWith(id, "/w/repo-b");
  });

  it("does nothing when the folder isn't reported missing", () => {
    const id = wsId();
    const { ctx, notify } = mockCtx({
      folder: "/w/repo",
      extraFolders: ["/w/repo-b"],
    });
    notifyMissingFolder(ctx, id, "/w/repo-b", false);
    expect(notify).not.toHaveBeenCalled();
  });

  it("never notifies for the workspace's primary folder", () => {
    const id = wsId();
    const { ctx, notify } = mockCtx({ folder: "/w/repo" });
    notifyMissingFolder(ctx, id, "/w/repo", true);
    expect(notify).not.toHaveBeenCalled();
  });

  it("skips a folder that's already been removed from the workspace by the time this fires", () => {
    // Guards against the race in confirmAndRemoveWorktree: it calls
    // ctx.workspaces.removeFolder synchronously, before the disk removal
    // completes, so a status fetch already in flight for that same folder
    // can resolve with `missing: true` afterward. Re-checking live
    // `extraFolders` membership (like notifyNewWorktrees re-derives
    // allFolders) means that in-flight resolution is a no-op instead of a
    // spurious "remove it?" toast for a folder already gone.
    const id = wsId();
    const { ctx, notify } = mockCtx({ folder: "/w/repo" }); // no extraFolders — already removed
    notifyMissingFolder(ctx, id, "/w/repo-b", true);
    expect(notify).not.toHaveBeenCalled();
  });

  it("does not re-notify a folder already in the session set", () => {
    const id = wsId();
    const { ctx, notify } = mockCtx({
      folder: "/w/repo",
      extraFolders: ["/w/repo-b"],
    });
    notifyMissingFolder(ctx, id, "/w/repo-b", true);
    notifyMissingFolder(ctx, id, "/w/repo-b", true);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("notifies once per missing folder when there are several", () => {
    const id = wsId();
    const { ctx, notify } = mockCtx({
      folder: "/w/repo",
      extraFolders: ["/w/repo-b", "/w/repo-c"],
    });
    notifyMissingFolder(ctx, id, "/w/repo-b", true);
    notifyMissingFolder(ctx, id, "/w/repo-c", true);
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it("keys the de-dup set per workspace, not just per path", () => {
    const idA = wsId();
    const idB = wsId();

    const a = mockCtx({ folder: "/w/repo", extraFolders: ["/w/shared"] });
    notifyMissingFolder(a.ctx, idA, "/w/shared", true);

    const b = mockCtx({ folder: "/w/repo", extraFolders: ["/w/shared"] });
    notifyMissingFolder(b.ctx, idB, "/w/shared", true);
    expect(b.notify).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the workspace is unknown", () => {
    const id = wsId();
    const { ctx, notify } = mockCtx(undefined);
    notifyMissingFolder(ctx, id, "/w/repo-b", true);
    expect(notify).not.toHaveBeenCalled();
  });
});
