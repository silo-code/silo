import type { ExtensionContext } from "@silo-code/sdk";
import { describe, it, expect, vi } from "vitest";
import { notifyMissingFolder } from "./notify-missing-folder";

function mockCtx(
  ws: { folder: string; extraFolders?: string[]; name?: string } | undefined,
  opts: { activeId?: string | null } = {},
): {
  ctx: ExtensionContext;
  notify: ReturnType<typeof vi.fn>;
  removeFolder: ReturnType<typeof vi.fn>;
} {
  const notify = vi.fn();
  const removeFolder = vi.fn();
  const ctx = {
    ui: { notify },
    workspaces: {
      get: () => (ws ? { name: "Test Workspace", ...ws } : undefined),
      removeFolder,
      getState: () => ({ activeId: opts.activeId ?? null }),
    },
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
  it("notifies for a missing extra folder in the active workspace, offering to remove it", () => {
    const id = wsId();
    const { ctx, notify, removeFolder } = mockCtx(
      { folder: "/w/repo", extraFolders: ["/w/repo-b"] },
      { activeId: id },
    );

    notifyMissingFolder(ctx, id, "/w/repo-b");

    // Active workspace — no name suffix needed, it's unambiguous.
    expect(notify).toHaveBeenCalledWith(
      "warn",
      '"repo-b" could not be found. Remove it from the workspace?',
      expect.objectContaining({ title: "Workspace folder not found" }),
    );

    const options = notify.mock.calls[0]![2];
    options.actions[0].run();
    expect(removeFolder).toHaveBeenCalledWith(id, "/w/repo-b");
  });

  it("names the workspace when it isn't the active one, so 'Remove folder' isn't ambiguous", () => {
    const id = wsId();
    const { ctx, notify } = mockCtx(
      { folder: "/w/repo", extraFolders: ["/w/repo-b"], name: "Backend API" },
      { activeId: "some-other-workspace" },
    );

    notifyMissingFolder(ctx, id, "/w/repo-b");

    expect(notify).toHaveBeenCalledWith(
      "warn",
      '"repo-b" could not be found from "Backend API". Remove it from the workspace?',
      expect.objectContaining({ title: "Workspace folder not found" }),
    );
  });

  it("never notifies for the workspace's primary folder", () => {
    const id = wsId();
    const { ctx, notify } = mockCtx({ folder: "/w/repo" }, { activeId: id });
    notifyMissingFolder(ctx, id, "/w/repo");
    expect(notify).not.toHaveBeenCalled();
  });

  it("skips a folder that's already been removed from the workspace by the time this fires", () => {
    // Guards against the race in confirmAndRemoveWorktree: it calls
    // ctx.workspaces.removeFolder synchronously, before the disk removal
    // completes, so a read already in flight for that same folder can
    // resolve with `missing: true` afterward. Re-checking live
    // `extraFolders` membership (like notifyNewWorktree re-derives
    // allFolders) means that in-flight resolution is a no-op instead of a
    // spurious "remove it?" toast for a folder already gone.
    const id = wsId();
    const { ctx, notify } = mockCtx(
      { folder: "/w/repo" }, // no extraFolders — already removed
      { activeId: id },
    );
    notifyMissingFolder(ctx, id, "/w/repo-b");
    expect(notify).not.toHaveBeenCalled();
  });

  it("does not re-notify a folder already in the session set", () => {
    const id = wsId();
    const { ctx, notify } = mockCtx(
      { folder: "/w/repo", extraFolders: ["/w/repo-b"] },
      { activeId: id },
    );
    notifyMissingFolder(ctx, id, "/w/repo-b");
    notifyMissingFolder(ctx, id, "/w/repo-b");
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("notifies once per missing folder when there are several", () => {
    const id = wsId();
    const { ctx, notify } = mockCtx(
      { folder: "/w/repo", extraFolders: ["/w/repo-b", "/w/repo-c"] },
      { activeId: id },
    );
    notifyMissingFolder(ctx, id, "/w/repo-b");
    notifyMissingFolder(ctx, id, "/w/repo-c");
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it("keys the de-dup set per workspace, not just per path", () => {
    const idA = wsId();
    const idB = wsId();

    const a = mockCtx(
      { folder: "/w/repo", extraFolders: ["/w/shared"] },
      { activeId: idA },
    );
    notifyMissingFolder(a.ctx, idA, "/w/shared");

    const b = mockCtx(
      { folder: "/w/repo", extraFolders: ["/w/shared"] },
      { activeId: idB },
    );
    notifyMissingFolder(b.ctx, idB, "/w/shared");
    expect(b.notify).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the workspace is unknown", () => {
    const id = wsId();
    const { ctx, notify } = mockCtx(undefined);
    notifyMissingFolder(ctx, id, "/w/repo-b");
    expect(notify).not.toHaveBeenCalled();
  });
});
