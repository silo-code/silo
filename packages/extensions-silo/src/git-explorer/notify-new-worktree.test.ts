import type { ExtensionContext } from "@silo-code/sdk";
import { describe, it, expect, vi } from "vitest";
import type { GitWorktree } from "../git/git-api";
import { notifyNewWorktrees } from "./notify-new-worktree";

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

function mockCtx(ws: { folder: string; extraFolders?: string[] } | undefined): {
  ctx: ExtensionContext;
  notify: ReturnType<typeof vi.fn>;
  addFolder: ReturnType<typeof vi.fn>;
} {
  const notify = vi.fn();
  const addFolder = vi.fn();
  const ctx = {
    ui: { notify },
    workspaces: { get: () => ws, addFolder },
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

describe("notifyNewWorktrees", () => {
  const main = wt({ path: "/w/repo", isMain: true, branch: "main" });

  it("notifies for a worktree created since the last check, offering to add it", () => {
    const id = wsId();
    const feat = wt({ path: "/w/repo-feat", branch: "feat" });
    const { ctx, notify, addFolder } = mockCtx({ folder: "/w/repo" });

    notifyNewWorktrees(ctx, id, [main], [main, feat]);

    expect(notify).toHaveBeenCalledWith(
      "info",
      '"repo-feat" (feat) was created. Add it to your workspace?',
      expect.objectContaining({ title: "New worktree detected" }),
    );

    const options = notify.mock.calls[0]![2];
    options.actions[0].run();
    expect(addFolder).toHaveBeenCalledWith(id, "/w/repo-feat");
  });

  it("skips a worktree already open as a workspace folder", () => {
    const id = wsId();
    const feat = wt({ path: "/w/repo-feat", branch: "feat" });
    const { ctx, notify } = mockCtx({
      folder: "/w/repo",
      extraFolders: ["/w/repo-feat"],
    });

    notifyNewWorktrees(ctx, id, [main], [main, feat]);
    expect(notify).not.toHaveBeenCalled();
  });

  it("skips a worktree that was already present in the previous check", () => {
    const id = wsId();
    const feat = wt({ path: "/w/repo-feat", branch: "feat" });
    const { ctx, notify } = mockCtx({ folder: "/w/repo" });

    notifyNewWorktrees(ctx, id, [main, feat], [main, feat]);
    expect(notify).not.toHaveBeenCalled();
  });

  it("does not re-notify the same worktree twice in a session", () => {
    const id = wsId();
    const feat = wt({ path: "/w/repo-feat", branch: "feat" });
    const { ctx, notify } = mockCtx({ folder: "/w/repo" });

    notifyNewWorktrees(ctx, id, [main], [main, feat]);
    notifyNewWorktrees(ctx, id, [main], [main, feat]);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("keys the de-dup per workspace, not just per path", () => {
    const idA = wsId();
    const idB = wsId();
    const feat = wt({ path: "/w/repo-feat", branch: "feat" });

    const a = mockCtx({ folder: "/w/repo" });
    notifyNewWorktrees(a.ctx, idA, [main], [main, feat]);

    const b = mockCtx({ folder: "/w/repo" });
    notifyNewWorktrees(b.ctx, idB, [main], [main, feat]);
    expect(b.notify).toHaveBeenCalledTimes(1);
  });

  it("notifies once per new worktree when several appear at once", () => {
    const id = wsId();
    const feat = wt({ path: "/w/repo-feat", branch: "feat" });
    const alpha = wt({ path: "/w/repo-alpha", branch: "alpha" });
    const { ctx, notify } = mockCtx({ folder: "/w/repo" });

    notifyNewWorktrees(ctx, id, [main], [main, feat, alpha]);
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it("does nothing when the workspace is unknown", () => {
    const id = wsId();
    const feat = wt({ path: "/w/repo-feat", branch: "feat" });
    const { ctx, notify } = mockCtx(undefined);

    notifyNewWorktrees(ctx, id, [main], [main, feat]);
    expect(notify).not.toHaveBeenCalled();
  });
});
