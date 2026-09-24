import type { GitFileStatus, GitStatus } from "./git-api";

// Pure parser for `git status --porcelain=v2 -z -b --untracked-files=all`
// output. Extracted from the old services/tauri-git.ts so the Rust→TS move of
// the parsing is provably faithful — exercised against captured fixtures in
// parse-status.test.ts. Keeping it a pure string→GitStatus function (no invoke,
// no exec) is what makes that test possible and what lets the git provider be
// built on the generic ctx.process.exec primitive.
//
// `-z` is load-bearing: without it, git C-quotes any path containing a
// non-ASCII byte (or backslash/doublequote) — e.g. `"my \342\200\224 file.md"`
// — and the quoted, octal-escaped form would end up as the literal path used
// to open the file. `-z` reports every path as raw, unquoted bytes and
// NUL-terminates every record (including the `# branch.*` headers and, for a
// rename, the orig/new path pair) instead of using `\n`/`\t`.

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

  const records = raw.split("\0");
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (!record) continue;
    if (record.startsWith("# branch.oid")) {
      // `(initial)` on a fresh repo with no commits — HEAD resolves to nothing.
      const oid = record.replace("# branch.oid ", "").trim();
      headSha = oid === "(initial)" ? null : oid;
    } else if (record.startsWith("# branch.head")) {
      branch = record.replace("# branch.head ", "").trim();
    } else if (record.startsWith("# branch.upstream")) {
      upstream = record.replace("# branch.upstream ", "").trim();
    } else if (record.startsWith("# branch.ab")) {
      const m = record.match(/\+(\d+)\s+-(\d+)/);
      if (m) {
        ahead = parseInt(m[1], 10);
        behind = parseInt(m[2], 10);
      }
    } else if (record.startsWith("1 ") || record.startsWith("2 ")) {
      const parts = record.split(SPACE);
      const xy = parts[1] ?? "..";
      const staged = xy[0] ?? ".";
      const worktree = xy[1] ?? ".";
      const isRenamed = record.startsWith("2 ");
      if (isRenamed) {
        // With `-z`, a rename's path is this record's tail, and its origPath
        // is the *next* NUL-terminated record — no embedded tab to split on.
        const path = parts.slice(9).join(SPACE);
        const orig = records[++i];
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
    } else if (record.startsWith("? ")) {
      files.push({
        path: record.slice(2),
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
