import type { GitAPI, GitLogEntry } from "./git-api";
import { parseGitStatus } from "./parse-status";

// The GitAPI implementation, built on a generic one-shot `exec` (ctx.process.exec
// in the app; a real-git wrapper in the contract test). This is the whole point
// of the split: git is `exec("git", […], { cwd })` + pure parsing, with no
// privileged host access of its own — so it's an extension, not core. `exec` is
// injected rather than imported so the service is unit-testable against a temp
// repo without the running app.

const TAB = "\t";

/** The subset of `ctx.process.exec` the git service needs. */
export type ExecFn = (
  command: string,
  args: string[],
  options?: { cwd?: string },
) => Promise<{ stdout: string; stderr: string; code: number }>;

function parseLog(raw: string): GitLogEntry[] {
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, shortHash, author, relativeDate, ...rest] = line.split(TAB);
      return {
        hash: hash ?? "",
        shortHash: shortHash ?? "",
        author: author ?? "",
        relativeDate: relativeDate ?? "",
        subject: rest.join(TAB),
      };
    });
}

/** Build a {@link GitAPI} backed by the given one-shot `exec`. */
export function createGitService(exec: ExecFn): GitAPI {
  const git = (cwd: string, args: string[]) => exec("git", args, { cwd });

  // Mutating commands: succeed silently, throw the stderr on failure (the old
  // run_git rejected on non-zero, and the view surfaces the message).
  async function run(cwd: string, args: string[]): Promise<void> {
    const { stderr, code } = await git(cwd, args);
    if (code !== 0) throw new Error(stderr.trim() || `git ${args[0]} failed`);
  }

  return {
    async status(cwd) {
      const { stdout, stderr, code } = await git(cwd, [
        "status",
        "--porcelain=v2",
        "-b",
        // Expand untracked directories into their files (don't collapse a whole
        // untracked subtree into one `directory/` row).
        "--untracked-files=all",
      ]);
      if (code !== 0) {
        if (stderr.includes("not a git repository")) {
          return {
            branch: null,
            upstream: null,
            ahead: 0,
            behind: 0,
            files: [],
            inRepo: false,
          };
        }
        throw new Error(stderr.trim() || "git status failed");
      }
      return parseGitStatus(stdout);
    },

    async log(cwd, limit = 50) {
      const { stdout, code } = await git(cwd, [
        "log",
        "--pretty=format:%H%x09%h%x09%an%x09%ar%x09%s",
        `-${limit}`,
      ]);
      // Any error (e.g. empty repo with no commits) → no history.
      if (code !== 0) return [];
      return parseLog(stdout);
    },

    async diff(cwd, path, staged = false) {
      const args = ["diff"];
      if (staged) args.push("--cached");
      if (path) args.push("--", path);
      const { stdout, stderr, code } = await git(cwd, args);
      if (code !== 0) throw new Error(stderr.trim() || "git diff failed");
      return stdout;
    },

    stage(cwd, paths) {
      return run(cwd, ["add", "--", ...paths]);
    },

    unstage(cwd, paths) {
      return run(cwd, ["restore", "--staged", "--", ...paths]);
    },

    commit(cwd, message) {
      return run(cwd, ["commit", "-m", message]);
    },

    async show(cwd, reference) {
      const { stdout, code } = await git(cwd, ["show", reference]);
      // Path didn't exist at that revision (e.g. an untracked file's HEAD
      // version) → treat as an empty file, matching the old git_show.
      if (code !== 0) return "";
      return stdout;
    },

    revertFile(cwd, paths) {
      return run(cwd, [
        "restore",
        "--source=HEAD",
        "--staged",
        "--worktree",
        "--",
        ...paths,
      ]);
    },

    push(cwd) {
      return run(cwd, ["push"]);
    },
  };
}
