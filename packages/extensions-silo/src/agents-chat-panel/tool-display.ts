/**
 * How a tool-call row presents the protocol's coarse `kind` — the label next
 * to the title, and which glyph stands in for the old generic wrench.
 *
 * The protocol's vocabulary is lowercase (`"read"`, `"execute"`, …). We don't
 * print that raw: capitalize, and rename `execute` → Shell (Dave's call).
 * Unknown / vendor kinds still get a first letter up, never a throw.
 */

/** Glyph id the row maps onto a Phosphor icon. Keep this a string so the
 *  rule is testable without importing React. */
export type ToolIconId =
  | "shell"
  | "read"
  | "write"
  | "search"
  | "delete"
  | "move"
  | "think"
  | "fetch"
  | "switch"
  | "mcp"
  | "subagent"
  | "other";

const KIND_LABELS: Readonly<Record<string, string>> = {
  execute: "Shell",
};

const KIND_ICONS: Readonly<Record<string, ToolIconId>> = {
  execute: "shell",
  read: "read",
  edit: "write",
  search: "search",
  delete: "delete",
  move: "move",
  think: "think",
  fetch: "fetch",
  switch_mode: "switch",
};

function normalizeKind(kind: string | undefined): string | undefined {
  const key = kind?.trim().toLowerCase();
  return key || undefined;
}

/** MCP servers show up as kind `"other"` (or no kind) with a title that
 *  starts `mcp` / `mcp__` / `mcp-`. The plug is the tell; "Other" is not. */
export function isMcpToolTitle(title: string): boolean {
  return /^mcp([_-]|$)/i.test(title.trim());
}

/** Visible kind label, or `undefined` when the row should show only the
 *  title (no kind, or an MCP title that already names itself).
 *
 * A **subagent dispatch** (RFC 0055) shows no kind either. The agents probed
 * send it as kind `"think"`, which is both wrong and redundant beside a title
 * that already reads `Agent(…)` — dispatching work is not the agent thinking
 * out loud, and the row has its own glyph to say what it is. */
export function formatToolKindLabel(
  kind: string | undefined,
  title = "",
  subagent = false,
): string | undefined {
  if (subagent) return undefined;
  const key = normalizeKind(kind);
  if (!key) return undefined;
  if (key === "other" && isMcpToolTitle(title)) return undefined;
  if (KIND_LABELS[key]) return KIND_LABELS[key];
  const spaced = key.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function toolIconId(
  kind: string | undefined,
  title = "",
  subagent = false,
): ToolIconId {
  // A dispatch is what it is regardless of the kind the agent labelled it
  // with — `"think"` on every agent probed, which would otherwise put a
  // lightbulb on a row that started another agent (RFC 0055).
  if (subagent) return "subagent";
  const key = normalizeKind(kind);
  // Kind wins when the agent gave a real category — a Read of `mcp-notes.md`
  // is still a read. The plug is only for MCP-shaped titles with no better
  // kind (`other` or missing).
  if ((!key || key === "other") && isMcpToolTitle(title)) return "mcp";
  if (!key) return "other";
  return KIND_ICONS[key] ?? "other";
}
