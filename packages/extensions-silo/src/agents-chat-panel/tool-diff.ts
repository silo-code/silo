/**
 * Turn an edit tool call into a displayable line hunk.
 *
 * Protocol `"diff"` blocks already carry `oldText` / `newText` (ACP). Claude's
 * Edit tool often only puts the replacement on `rawInput` (`old_string` /
 * `new_string`). Both become the same {@link ToolDiff} so the expanded row
 * can paint one red/green view (Dave's call).
 */

import type { AgentToolCallContent } from "@silo-code/sdk";

export interface ToolDiff {
  readonly path?: string;
  readonly oldText: string;
  readonly newText: string;
}

export type DiffLineKind = "eq" | "del" | "add";

export interface DiffLine {
  readonly kind: DiffLineKind;
  readonly text: string;
  /** 1-based. Deletions use the old file; everything else uses the new file. */
  readonly line: number;
}

/** Above this product, skip LCS and dump the middle as delete-then-add. */
const MAX_LCS_CELLS = 800 * 800;

/** Unchanged lines kept on each side of the changed middle. */
const CONTEXT = 3;

const PATH_KEYS = ["file_path", "path"] as const;
const OLD_KEYS = ["old_string", "oldText", "old_text"] as const;
const NEW_KEYS = ["new_string", "newText", "new_text"] as const;
const DIFF_INPUT_KEYS = new Set<string>([
  ...PATH_KEYS,
  ...OLD_KEYS,
  ...NEW_KEYS,
]);

function nonEmpty(v: string | undefined): string | undefined {
  return v !== undefined && v.length > 0 ? v : undefined;
}

function pickStr(
  obj: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string") return v;
  }
  return undefined;
}

export function toolDiffsFromContent(
  content: readonly AgentToolCallContent[] | undefined,
): ToolDiff[] {
  if (!content) return [];
  const out: ToolDiff[] = [];
  for (const block of content) {
    if (block.type !== "diff") continue;
    if (block.oldText === undefined && block.newText === undefined) continue;
    // A create has no previous text — don't dump the new file as a hunk.
    if ((block.oldText ?? "").length === 0) continue;
    out.push({
      ...(nonEmpty(block.path) ? { path: block.path } : {}),
      oldText: block.oldText ?? "",
      newText: block.newText ?? "",
    });
  }
  return out;
}

export function toolDiffFromRawInput(rawInput: unknown): ToolDiff | undefined {
  if (
    rawInput === undefined ||
    rawInput === null ||
    typeof rawInput !== "object"
  ) {
    return undefined;
  }
  const obj = rawInput as Record<string, unknown>;
  const oldText = pickStr(obj, OLD_KEYS);
  const newText = pickStr(obj, NEW_KEYS);
  if (oldText === undefined && newText === undefined) return undefined;
  // Write-a-new-file: only `new_string` / `contents`, no previous text.
  if ((oldText ?? "").length === 0) return undefined;
  const path = pickStr(obj, PATH_KEYS);
  return {
    ...(nonEmpty(path) ? { path } : {}),
    oldText: oldText ?? "",
    newText: newText ?? "",
  };
}

/** Content diffs win; otherwise a replacement sitting on `rawInput`. */
export function resolveToolDiffs(
  content: readonly AgentToolCallContent[] | undefined,
  rawInput: unknown,
): ToolDiff[] {
  const fromContent = toolDiffsFromContent(content);
  if (fromContent.length > 0) return fromContent;
  const fromInput = toolDiffFromRawInput(rawInput);
  return fromInput ? [fromInput] : [];
}

/** Edit rows show their hunk in the transcript, not behind a disclosure. */
export function toolShowsInlineDiff(
  kind: string | undefined,
  diffCount: number,
): boolean {
  return diffCount > 0 && kind?.trim().toLowerCase() === "edit";
}

/** True when Input would only repeat the strings already in the hunk. */
export function toolInputIsDiffOnly(rawInput: unknown): boolean {
  if (
    rawInput === undefined ||
    rawInput === null ||
    typeof rawInput !== "object"
  ) {
    return false;
  }
  const keys = Object.keys(rawInput);
  return keys.length > 0 && keys.every((k) => DIFF_INPUT_KEYS.has(k));
}

export function splitLines(text: string): string[] {
  if (text.length === 0) return [];
  const parts = text.split("\n");
  if (parts[parts.length - 1] === "") parts.pop();
  return parts;
}

function lcsDiff(
  a: string[],
  b: string[],
  oldStart: number,
  newStart: number,
): DiffLine[] {
  let oldLine = oldStart;
  let newLine = newStart;
  const numberedAdd = (text: string): DiffLine => {
    const line = newLine;
    newLine += 1;
    return { kind: "add", text, line };
  };
  const numberedDel = (text: string): DiffLine => {
    const line = oldLine;
    oldLine += 1;
    return { kind: "del", text, line };
  };
  const numberedEq = (text: string): DiffLine => {
    const line = newLine;
    oldLine += 1;
    newLine += 1;
    return { kind: "eq", text, line };
  };
  if (a.length === 0) return b.map(numberedAdd);
  if (b.length === 0) return a.map(numberedDel);
  if (a.length * b.length > MAX_LCS_CELLS) {
    return [...a.map(numberedDel), ...b.map(numberedAdd)];
  }
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push(numberedEq(a[i]));
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push(numberedDel(a[i]));
      i += 1;
    } else {
      out.push(numberedAdd(b[j]));
      j += 1;
    }
  }
  while (i < n) {
    out.push(numberedDel(a[i]));
    i += 1;
  }
  while (j < m) {
    out.push(numberedAdd(b[j]));
    j += 1;
  }
  return out;
}

/** Line hunk with a few unchanged lines of context on each side. */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = splitLines(oldText);
  const b = splitLines(newText);
  if (a.length === 0 && b.length === 0) return [];
  if (a.length === 0) {
    return b.map((text, i) => ({ kind: "add" as const, text, line: i + 1 }));
  }
  if (b.length === 0) {
    return a.map((text, i) => ({ kind: "del" as const, text, line: i + 1 }));
  }

  let start = 0;
  const min = Math.min(a.length, b.length);
  while (start < min && a[start] === b[start]) start += 1;
  let aEnd = a.length - 1;
  let bEnd = b.length - 1;
  while (aEnd >= start && bEnd >= start && a[aEnd] === b[bEnd]) {
    aEnd -= 1;
    bEnd -= 1;
  }

  const preFrom = Math.max(0, start - CONTEXT);
  const pre = a.slice(preFrom, start).map((text, i) => ({
    kind: "eq" as const,
    text,
    line: preFrom + i + 1,
  }));
  const mid = lcsDiff(
    a.slice(start, aEnd + 1),
    b.slice(start, bEnd + 1),
    start + 1,
    start + 1,
  );
  const post = a.slice(aEnd + 1, aEnd + 1 + CONTEXT).map((text, i) => ({
    kind: "eq" as const,
    text,
    line: bEnd + 2 + i,
  }));
  return [...pre, ...mid, ...post];
}

export function diffStats(lines: readonly DiffLine[]): {
  added: number;
  removed: number;
} {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.kind === "add") added += 1;
    else if (line.kind === "del") removed += 1;
  }
  return { added, removed };
}

export function diffFileName(path: string | undefined): string {
  if (!path) return "file";
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

export function diffHeading(
  diff: ToolDiff,
  lines: readonly DiffLine[],
): string {
  const { added, removed } = diffStats(lines);
  const name = diffFileName(diff.path);
  if (diff.oldText.length === 0 && diff.newText.length > 0) {
    return `Created ${name} +${added}`;
  }
  if (diff.newText.length === 0 && diff.oldText.length > 0) {
    return `Deleted ${name} -${removed}`;
  }
  return `Edited ${name} +${added} -${removed}`;
}
