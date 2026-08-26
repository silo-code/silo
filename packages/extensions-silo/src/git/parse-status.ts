import type { GitFileStatus, GitStatus } from "./git-api";

// Pure parser for `git status --porcelain=v2 -b --untracked-files=all` output.
// Extracted verbatim from the old services/tauri-git.ts so the Rust→TS move of
// the parsing is provably faithful — exercised against captured fixtures in
// parse-status.test.ts. Keeping it a pure string→GitStatus function (no invoke,
// no exec) is what makes that test possible and what lets the git provider be
// built on the generic ctx.process.exec primitive.

const TAB = "\t";
const SPACE = " ";

function decodeStatusFlag(c: string): boolean {
  return c !== "." && c !== " ";
}

/**
 * Parse porcelain v2 status output into a {@link GitStatus}. Always reports
 * `inRepo: true` — the caller decides `inRepo: false` when `git` itself errored
 * with "not a git repository" (that signal isn't in the output text).
 */
export function parseGitStatus(raw: string): GitStatus {
  let branch: string | null = null;
  let upstream: string | null = null;
  let ahead = 0;
  let behind = 0;
  let headSha: string | null = null;
  const files: GitFileStatus[] = [];

  for (const line of raw.split("\n")) {
    if (!line) continue;
    if (line.startsWith("# branch.oid")) {
      // `(initial)` on a fresh repo with no commits — HEAD resolves to nothing.
      const oid = line.replace("# branch.oid ", "").trim();
      headSha = oid === "(initial)" ? null : oid;
    } else if (line.startsWith("# branch.head")) {
      branch = line.replace("# branch.head ", "").trim();
    } else if (line.startsWith("# branch.upstream")) {
      upstream = line.replace("# branch.upstream ", "").trim();
    } else if (line.startsWith("# branch.ab")) {
      const m = line.match(/\+(\d+)\s+-(\d+)/);
      if (m) {
        ahead = parseInt(m[1], 10);
        behind = parseInt(m[2], 10);
      }
    } else if (line.startsWith("1 ") || line.startsWith("2 ")) {
      const parts = line.split(SPACE);
      const xy = parts[1] ?? "..";
      const staged = xy[0] ?? ".";
      const worktree = xy[1] ?? ".";
      const isRenamed = line.startsWith("2 ");
      if (isRenamed) {
        const tail = parts.slice(9).join(SPACE);
        const sep = tail.indexOf(TAB);
        const path = sep === -1 ? tail : tail.slice(0, sep);
        const orig = sep === -1 ? undefined : tail.slice(sep + 1);
        files.push({
          path,
          staged,
          worktree,
          isStaged: decodeStatusFlag(staged),
          isModified: decodeStatusFlag(worktree),
          isUntracked: false,
          isRenamed: true,
          origPath: orig,
        });
      } else {
        const path = parts.slice(8).join(SPACE);
        files.push({
          path,
          staged,
          worktree,
          isStaged: decodeStatusFlag(staged),
          isModified: decodeStatusFlag(worktree),
          isUntracked: false,
          isRenamed: false,
        });
      }
    } else if (line.startsWith("? ")) {
      files.push({
        path: line.slice(2),
        staged: ".",
        worktree: "?",
        isStaged: false,
        isModified: true,
        isUntracked: true,
        isRenamed: false,
      });
    }
  }
  return { branch, upstream, ahead, behind, files, inRepo: true, headSha };
}
