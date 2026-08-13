/**
 * `@silo-code/git-api` — published types for Silo's `silo.git` provider.
 *
 * Import types from here at build time; retrieve the live implementation at
 * runtime via `ctx.getExtension<GitAPI>("silo.git")?.api` (`@silo-code/sdk`).
 * See ADR 0009 (typed published APIs) and ADR 0037 (the `watchRepo` live
 * session) in the `silo-code/silo` repo for the rationale.
 */
export type {
  GitAPI,
  GitFileStatus,
  GitStatus,
  GitLogEntry,
  CommitFileChange,
  CommitDetail,
  GitBranch,
  GitWorktree,
} from "./git-api";
export type { GitRepoSnapshot, GitRepoStore } from "./git-repo-store";
export { NULL_GIT_REPO_STORE } from "./git-repo-store";
