import type { ExtensionContext } from "@silo-code/sdk";
import { describe, it, expect, vi } from "vitest";
import { checkMissingExtraFolders } from "./missing-folder-notify";

function mockCtx(pathExists: (p: string) => Promise<boolean>): {
  ctx: ExtensionContext;
  notify: ReturnType<typeof vi.fn>;
  removeFolder: ReturnType<typeof vi.fn>;
} {
  const notify = vi.fn();
  const removeFolder = vi.fn();
  const ctx = {
    files: { pathExists },
    ui: { notify },
    workspaces: { removeFolder },
  } as unknown as ExtensionContext;
  return { ctx, notify, removeFolder };
}

describe("checkMissingExtraFolders", () => {
  it("notifies once for a missing extra folder, offering to remove it", async () => {
    const { ctx, notify, removeFolder } = mockCtx(async () => false);
    const notified = new Set<string>();
    await checkMissingExtraFolders(
      ctx,
      { id: "ws1", extraFolders: ["/w/repo-b"] },
      notified,
    );

    expect(notify).toHaveBeenCalledWith(
      "warn",
      '"repo-b" could not be found. Remove it from the workspace?',
      expect.objectContaining({ title: "Workspace folder not found" }),
    );

    // The notify action removes exactly this folder from this workspace.
    const options = notify.mock.calls[0]![2];
    options.actions[0].run();
    expect(removeFolder).toHaveBeenCalledWith("ws1", "/w/repo-b");
  });

  it("skips a folder that still exists on disk", async () => {
    const { ctx, notify } = mockCtx(async () => true);
    await checkMissingExtraFolders(
      ctx,
      { id: "ws1", extraFolders: ["/w/repo-b"] },
      new Set(),
    );
    expect(notify).not.toHaveBeenCalled();
  });

  it("never checks the primary folder — only extraFolders is read", async () => {
    const pathExists = vi.fn(async () => false);
    const { ctx, notify } = mockCtx(pathExists);
    await checkMissingExtraFolders(ctx, { id: "ws1" }, new Set());
    expect(pathExists).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("does not re-check or re-notify a folder already in the session set", async () => {
    const pathExists = vi.fn(async () => false);
    const { ctx, notify } = mockCtx(pathExists);
    const notified = new Set([`ws1::/w/repo-b`]);
    await checkMissingExtraFolders(
      ctx,
      { id: "ws1", extraFolders: ["/w/repo-b"] },
      notified,
    );
    expect(pathExists).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("fails open on a pathExists error — doesn't offer to drop an unconfirmed folder", async () => {
    const { ctx, notify } = mockCtx(async () => {
      throw new Error("permission denied");
    });
    await checkMissingExtraFolders(
      ctx,
      { id: "ws1", extraFolders: ["/w/repo-b"] },
      new Set(),
    );
    expect(notify).not.toHaveBeenCalled();
  });

  it("notifies once per missing folder when there are several", async () => {
    const { ctx, notify } = mockCtx(async () => false);
    const notified = new Set<string>();
    await checkMissingExtraFolders(
      ctx,
      { id: "ws1", extraFolders: ["/w/repo-b", "/w/repo-c"] },
      notified,
    );
    expect(notify).toHaveBeenCalledTimes(2);
    expect(notified).toEqual(new Set(["ws1::/w/repo-b", "ws1::/w/repo-c"]));
  });

  it("keys the de-dup set per workspace, not just per path", async () => {
    const { ctx, notify } = mockCtx(async () => false);
    const notified = new Set([`wsA::/w/shared`]);
    await checkMissingExtraFolders(
      ctx,
      { id: "wsB", extraFolders: ["/w/shared"] },
      notified,
    );
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
