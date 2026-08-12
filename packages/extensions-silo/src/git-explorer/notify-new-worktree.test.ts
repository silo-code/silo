import type { ExtensionContext } from "@silo-code/sdk";
import { describe, it, expect, vi } from "vitest";
import type { GitWorktree } from "@silo-code/git-api";
import { notifyNewWorktree } from "./notify-new-worktree";

function wt(overrides: Partial<GitWorktree>): GitWorktree {
  return {
    path: "/repo",
    head: "abc",
    branch: "main",
    isMain: false,
    detached: false,
    bare: false,
    locked: null,
    prunable: null,
    ...overrides,
  };
}

function mockCtx(
  ws: { folder: string; extraFolders?: string[]; name?: string } | undefined,
  opts: { activeId?: string | null } = {},
): {
  ctx: ExtensionContext;
  notify: ReturnType<typeof vi.fn>;
  addFolder: ReturnType<typeof vi.fn>;
} {
  const notify = vi.fn();
  const addFolder = vi.fn();
  const ctx = {
    ui: { notify },
    workspaces: {
      get: () => (ws ? { name: "Test Workspace", ...ws } : undefined),
      addFolder,
      getState: () => ({ activeId: opts.activeId ?? null }),
    },
  } as unknown as ExtensionContext;
  return { ctx, notify, addFolder };
}

// The de-dup set is module-level (session-lifetime, internal to the module),
// so each test uses a distinct workspace id to avoid cross-test interference.
let wsCounter = 0;
function wsId(): string {
  wsCounter += 1;
  return `ws${wsCounter}`;
}

describe("notifyNewWorktree", () => {
  it("notifies for a newly appeared worktree in the active workspace, offering to add it", () => {
    const id = wsId();
    const feat = wt({ path: "/w/repo-feat", branch: "feat" });
    const { ctx, notify, addFolder } = mockCtx(
      { folder: "/w/repo" },
      { activeId: id },
    );

    notifyNewWorktree(ctx, id, feat);

    // Active workspace — no name suffix needed, it's unambiguous.
    expect(notify).toHaveBeenCalledWith(
      "info",
      '"repo-feat" (feat) was created. Add it to your workspace?',
      expect.objectContaining({ title: "New worktree detected" }),
    );

    const options = notify.mock.calls[0]![2];
    options.actions[0].run();
    expect(addFolder).toHaveBeenCalledWith(id, "/w/repo-feat");
  });

  it("names the workspace when it isn't the active one, so 'Add to workspace' isn't ambiguous", () => {
    const id = wsId();
    const feat = wt({ path: "/w/repo-feat", branch: "feat" });
    const { ctx, notify } = mockCtx(
      { folder: "/w/repo", name: "Backend API" },
      { activeId: "some-other-workspace" },
    );

    notifyNewWorktree(ctx, id, feat);

    expect(notify).toHaveBeenCalledWith(
      "info",
      '"repo-feat" (feat) was created in "Backend API". Add it to your workspace?',
      expect.objectContaining({ title: "New worktree detected" }),
    );
  });

  it("skips a worktree already open as a workspace folder", () => {
    const id = wsId();
    const feat = wt({ path: "/w/repo-feat", branch: "feat" });
    const { ctx, notify } = mockCtx({
      folder: "/w/repo",
      extraFolders: ["/w/repo-feat"],
    });

    notifyNewWorktree(ctx, id, feat);
    expect(notify).not.toHaveBeenCalled();
  });

  it("does not re-notify the same worktree twice in a session", () => {
    const id = wsId();
    const feat = wt({ path: "/w/repo-feat", branch: "feat" });
    const { ctx, notify } = mockCtx({ folder: "/w/repo" }, { activeId: id });

    notifyNewWorktree(ctx, id, feat);
    notifyNewWorktree(ctx, id, feat);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("keys the de-dup per workspace, not just per path", () => {
    const idA = wsId();
    const idB = wsId();
    const feat = wt({ path: "/w/repo-feat", branch: "feat" });

    const a = mockCtx({ folder: "/w/repo" }, { activeId: idA });
    notifyNewWorktree(a.ctx, idA, feat);

    const b = mockCtx({ folder: "/w/repo" }, { activeId: idB });
    notifyNewWorktree(b.ctx, idB, feat);
    expect(b.notify).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the workspace is unknown", () => {
    const id = wsId();
    const feat = wt({ path: "/w/repo-feat", branch: "feat" });
    const { ctx, notify } = mockCtx(undefined);

    notifyNewWorktree(ctx, id, feat);
    expect(notify).not.toHaveBeenCalled();
  });
});
