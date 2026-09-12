/**
 * Parsing the Agent Client Protocol's `session/update` payload into the SDK's
 * modelled fields (RFC 0038 phase 3.8).
 *
 * This is where "the wire format is not the update stream" is actually
 * enforced: everything a Chat UI must draw — a tool call's id, title, kind,
 * status, content and locations, and the agent's plan — is read **here**, once,
 * defensively, so no consumer has to reach into `AgentSessionUpdate.raw` for it.
 * `raw` stays on the update as the escape hatch for the kinds this file
 * deliberately leaves alone (`available_commands_update`, `usage_update`,
 * vendor `_meta`, …).
 *
 * Every reader below tolerates a missing or wrongly-typed field, because the
 * wire genuinely varies: in the 2026-09-08 probe a `tool_call_update` was
 * usually `{ toolCallId, status }` alone, Cursor 2026.09.02 sent `locations`
 * with only `path` where `claude-agent-acp` 0.75.1 also sent `line`, and a
 * `"diff"` block's `oldText` arrives as `null` for a file being created.
 */

import type {
  AgentContentBlock,
  AgentPlanEntry,
  AgentToolCall,
  AgentToolCallContent,
  AgentToolCallLocation,
} from "@silo-code/sdk";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** One content block — the shape shared by a message chunk and a tool call's
 *  `"content"` envelope. */
export function parseContentBlock(v: unknown): AgentContentBlock | undefined {
  if (!isRecord(v)) return undefined;
  const type = str(v.type);
  if (type === undefined) return undefined;
  const text = str(v.text);
  const mimeType = str(v.mimeType);
  const uri = str(v.uri);
  const name = str(v.name);
  return {
    type,
    ...(text !== undefined ? { text } : {}),
    ...(mimeType !== undefined ? { mimeType } : {}),
    ...(uri !== undefined ? { uri } : {}),
    ...(name !== undefined ? { name } : {}),
  };
}

function parseToolCallContent(v: unknown): AgentToolCallContent | undefined {
  if (!isRecord(v)) return undefined;
  const type = str(v.type);
  if (type === undefined) return undefined;
  const content = parseContentBlock(v.content);
  const path = str(v.path);
  // `null` here means "the file did not exist" (a create), which is the same
  // information as "no previous text" — so it collapses to `undefined`.
  const oldText = str(v.oldText);
  const newText = str(v.newText);
  const terminalId = str(v.terminalId);
  return {
    type,
    ...(content ? { content } : {}),
    ...(path !== undefined ? { path } : {}),
    ...(oldText !== undefined ? { oldText } : {}),
    ...(newText !== undefined ? { newText } : {}),
    ...(terminalId !== undefined ? { terminalId } : {}),
  };
}

function parseLocations(
  v: unknown,
): readonly AgentToolCallLocation[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: AgentToolCallLocation[] = [];
  for (const entry of v) {
    if (!isRecord(entry)) continue;
    const path = str(entry.path);
    if (path === undefined) continue;
    const line = num(entry.line);
    out.push({ path, ...(line !== undefined ? { line } : {}) });
  }
  return out;
}

/**
 * A `tool_call` / `tool_call_update` payload, or the `toolCall` object a
 * `session/request_permission` carries — the same shape in both places.
 *
 * Returns `undefined` only when there is no usable id: the id is what a
 * consumer patches rows by, and a call without one cannot be tracked. Every
 * other field is omitted when the wire did not carry it, so a consumer can
 * tell "unchanged" from "now empty".
 */
export function parseToolCall(v: unknown): AgentToolCall | undefined {
  if (!isRecord(v)) return undefined;
  const toolCallId = str(v.toolCallId);
  if (toolCallId === undefined) return undefined;
  const title = str(v.title);
  const kind = str(v.kind);
  const status = str(v.status);
  const locations = parseLocations(v.locations);
  let content: AgentToolCallContent[] | undefined;
  if (Array.isArray(v.content)) {
    content = [];
    for (const block of v.content) {
      const parsed = parseToolCallContent(block);
      if (parsed) content.push(parsed);
    }
  }
  return {
    toolCallId,
    ...(title !== undefined ? { title } : {}),
    ...(kind !== undefined ? { kind } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(content !== undefined ? { content } : {}),
    ...(locations !== undefined ? { locations } : {}),
    ...("rawInput" in v ? { rawInput: v.rawInput } : {}),
    ...("rawOutput" in v ? { rawOutput: v.rawOutput } : {}),
  };
}

/**
 * A `plan` update's entries. The agent reissues its whole plan each time, so
 * this is the plan, not a delta — an empty array is a real answer (the agent
 * cleared it) and is distinct from `undefined` (not a plan update at all).
 *
 * An entry with no `content` has nothing to show and is dropped.
 */
export function parsePlanEntries(
  v: unknown,
): readonly AgentPlanEntry[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: AgentPlanEntry[] = [];
  for (const entry of v) {
    if (!isRecord(entry)) continue;
    const content = str(entry.content);
    if (content === undefined || content.length === 0) continue;
    const status = str(entry.status);
    const priority = str(entry.priority);
    out.push({
      content,
      ...(status !== undefined ? { status } : {}),
      ...(priority !== undefined ? { priority } : {}),
    });
  }
  return out;
}
