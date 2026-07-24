import type { CommitFileChange } from "./git-api";

// Pure parsers for a commit's changed-file list, built from two separate
// `git diff-tree` invocations (see git-service.ts's commitDetail): one
// `--name-status -M` (status letters + rename source, unambiguous — a rename
// is one `R100\told\tnew` line) and one plain `--numstat` — deliberately
// *without* `-M`, so a rename reports as delete+add (two simple rows) rather
// than git's ambiguous `{old => new}` / `old => new` numstat rename syntax.
// mergeCommitFiles reconciles the two by path, trying both the new and (for a
// rename) the original path when looking up stats.

const TAB = "\t";

/** The canonical empty-tree object — every git repo has it. Diffing a root
 * commit (no parents) against it makes every file show as added. */
export const EMPTY_TREE_HASH = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/** The base to diff a commit against: its first parent, or the empty tree
 * for a root commit (no parents) — the `--first-parent` convention for
 * merges (see {@link import("./git-api").GitAPI.commitDetail}). */
export function resolveDiffBase(parents: string[]): string {
  return parents[0] ?? EMPTY_TREE_HASH;
}

interface NameStatusRow {
  path: string;
  origPath?: string;
  status: CommitFileChange["status"];
}

function statusLetter(raw: string): CommitFileChange["status"] {
  const c = raw[0] as CommitFileChange["status"];
  return c === "A" ||
    c === "M" ||
    c === "D" ||
    c === "R" ||
    c === "C" ||
    c === "T" ||
    c === "U" ||
    c === "X"
    ? c
    : "M";
}

/** Parse `git diff-tree --no-commit-id -r -M --name-status <base> <commit>`. */
export function parseNameStatus(raw: string): NameStatusRow[] {
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(TAB);
      const status = statusLetter(parts[0] ?? "M");
      if (status === "R" || status === "C") {
        return { path: parts[2] ?? "", origPath: parts[1], status };
      }
      return { path: parts[1] ?? "", status };
    });
}

interface NumstatRow {
  path: string;
  additions: number | null;
  deletions: number | null;
}

/** Parse `git diff-tree --no-commit-id -r --numstat <base> <commit>` (no
 * `-M`, so every row is a plain path — never `{old => new}`). */
export function parseNumstat(raw: string): NumstatRow[] {
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [add, del, ...rest] = line.split(TAB);
      const path = rest.join(TAB);
      const binary = add === "-" || del === "-";
      return {
        path,
        additions: binary ? null : parseInt(add ?? "0", 10),
        deletions: binary ? null : parseInt(del ?? "0", 10),
      };
    });
}

/**
 * Reconcile a `--name-status -M` list (correct file identity, incl. renames)
 * with a plain `--numstat` list (correct per-path line counts, but a rename
 * appears as separate delete+add rows there). Stats are looked up by the
 * row's own path, falling back to `origPath` for a rename (whose numstat
 * "add" row lives at the new path already, so this mainly helps when only
 * the delete-side numstat row is present, e.g. a rename with no content
 * change beyond the move).
 */
export function mergeCommitFiles(
  nameStatus: NameStatusRow[],
  numstat: NumstatRow[],
): CommitFileChange[] {
  const statsByPath = new Map<string, NumstatRow>();
  for (const row of numstat) statsByPath.set(row.path, row);

  return nameStatus.map((row) => {
    const stats =
      statsByPath.get(row.path) ?? statsByPath.get(row.origPath ?? "");
    const additions = stats?.additions ?? null;
    const deletions = stats?.deletions ?? null;
    return {
      path: row.path,
      origPath: row.origPath,
      status: row.status,
      binary: stats !== undefined && additions === null,
      additions,
      deletions,
    };
  });
}
