import { describe, expect, it } from "vitest";
import { NULL_GIT_REPO_STORE } from "./git-repo-store";

describe("NULL_GIT_REPO_STORE", () => {
  it("reports an empty, non-loading snapshot", () => {
    expect(NULL_GIT_REPO_STORE.getState()).toEqual({
      status: null,
      worktrees: null,
      loading: false,
      error: null,
    });
  });

  it("subscribe/events return disposables that never fire", () => {
    const seen: unknown[] = [];
    const sub = NULL_GIT_REPO_STORE.subscribe((s) => seen.push(s));
    const added = NULL_GIT_REPO_STORE.onWorktreeAdded((wt) => seen.push(wt));
    const missing = NULL_GIT_REPO_STORE.onFolderMissing(() =>
      seen.push("missing"),
    );

    expect(seen).toEqual([]);
    expect(() => {
      sub.dispose();
      added.dispose();
      missing.dispose();
    }).not.toThrow();
  });

  it("every mutator rejects with the provider-unavailable message", async () => {
    await expect(NULL_GIT_REPO_STORE.commit("msg")).rejects.toThrow(
      "Git provider (silo.git) unavailable.",
    );
    await expect(NULL_GIT_REPO_STORE.push()).rejects.toThrow(
      "Git provider (silo.git) unavailable.",
    );
  });

  it(".api's one-shot methods also reject uniformly", async () => {
    await expect(NULL_GIT_REPO_STORE.api.status("/repo")).rejects.toThrow(
      "Git provider (silo.git) unavailable.",
    );
  });

  it(".api.watchRepo returns the same null store (no dead end)", () => {
    expect(NULL_GIT_REPO_STORE.api.watchRepo("/repo")).toBe(
      NULL_GIT_REPO_STORE,
    );
  });

  it("dispose() is a safe no-op", () => {
    expect(() => NULL_GIT_REPO_STORE.dispose()).not.toThrow();
  });
});
