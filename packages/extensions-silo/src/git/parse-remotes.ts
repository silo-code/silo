import type { GitRemote } from "./git-api";

// Pure parser for `git remote -v`. Kept a pure string→GitRemote[] function (no
// exec) so it's unit-testable against captured fixtures, the same way
// parse-status.ts, parse-branches.ts, and parse-worktrees.ts are.

// `<name>\t<url> (fetch|push)`. The URL is matched greedily so a path
// containing " (" (legal in a local remote's path) can't be mistaken for the
// trailing direction marker — only the *last* one on the line ends it.
const LINE_RE = /^([^\t]+)\t(.+) \((fetch|push)\)$/;

/**
 * Parse `git remote -v` output into {@link GitRemote} entries, preserving
 * git's own order (alphabetical by name). Git prints one `(fetch)` and one
 * `(push)` line per remote; a remote with only one of the two — which git
 * shouldn't emit, but a malformed config could — still yields an entry, with
 * the missing URL mirroring the one that is present.
 */
export function parseRemotes(raw: string): GitRemote[] {
  const byName = new Map<string, GitRemote>();
  for (const line of raw.split("\n")) {
    const m = LINE_RE.exec(line.trimEnd());
    if (!m) continue;
    const [, name, url, direction] = m;
    let remote = byName.get(name!);
    if (!remote) {
      // Seed both sides with this URL so a remote that only lists one
      // direction still reads coherently; the other line overwrites its own.
      remote = { name: name!, fetchUrl: url!, pushUrl: url! };
      byName.set(name!, remote);
    }
    if (direction === "fetch") remote.fetchUrl = url!;
    else remote.pushUrl = url!;
  }
  return [...byName.values()];
}
