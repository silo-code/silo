/**
 * The files a tool row *knows* it is about, for linking its title (RFC 0066).
 *
 * Three sources, in order of authority: the protocol's `locations` (the agent
 * naming the file outright), the path on a diff the call carried, and the
 * `file_path` / `path` its `rawInput` named. All three are exact, so a title
 * that contains one links *that*, rather than whatever the path regexes read
 * out of the same characters — which is how a path with spaces in it stops
 * being a guess.
 *
 * Memoized on the entry object so the array identity is stable across renders:
 * `LinkifiedText` is memoized on its props, and a fresh array every render
 * would defeat it on every tool row in the transcript (RFC 0050).
 */

import type { ToolEntry } from "./transcript-model";
import { toolPathFromRawInput } from "./tool-diff";

const cache = new WeakMap<ToolEntry, readonly string[]>();

const EMPTY: readonly string[] = [];

export function toolKnownPaths(entry: ToolEntry): readonly string[] {
  const hit = cache.get(entry);
  if (hit) return hit;
  const paths: string[] = [];
  const add = (p: string | undefined) => {
    if (p && !paths.includes(p)) paths.push(p);
  };
  for (const location of entry.locations ?? []) add(location.path);
  for (const diff of entry.diffs ?? []) add(diff.path);
  add(toolPathFromRawInput(entry.rawInput));
  const result = paths.length > 0 ? paths : EMPTY;
  cache.set(entry, result);
  return result;
}
