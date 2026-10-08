import { describe, it, expect } from "vitest";
import type {
  AgentPlanEntry,
  AgentSessionUpdate,
  AgentToolCall,
} from "@silo-code/sdk";
import {
  appendNotice,
  appendUserMessage,
  applyUpdate,
  closeDanglingTools,
  delegatedDispatchNotice,
  delegationSignature,
  delegationView,
  delegatedSummaryLabel,
  delegationOutcome,
  delegationStateTone,
  dispatchLabel,
  elapsedLabel,
  emptyDelegationView,
  emptyTranscript,
  foldToolRuns,
  formatMessageSentAt,
  groupDelegatedCalls,
  formatToolInput,
  groupTurns,
  isBlankMessageText,
  isToolRunning,
  nextEntryKey,
  delegatedDispatchNotice,
  sameTurn,
  planRows,
  seedFromJournal,
  stopReasonNotice,
  toolContentLines,
  toolGroupLabel,
  toolGroupCollapsed,
  toolGroupSettled,
  toolGroupSummaryLabel,
  toolOutputIsMarkdown,
  toolStatusTone,
  userPromptHistory,
  workedForLabel,
  TOOL_GROUP_THRESHOLD,
  type MessageEntry,
  type PlanEntry,
  type ToolEntry,
  type DelegatedGroupEntry,
  type ToolGroupEntry,
  type Transcript,
} from "./transcript-model";

function chunk(
  kind: string,
  text: string,
  messageId?: string,
): AgentSessionUpdate {
  return {
    kind,
    text,
    ...(messageId ? { messageId } : {}),
    raw: { sessionUpdate: kind, content: { type: "text", text } },
  };
}

/** A `tool_call` / `tool_call_update`, as the SDK delivers it — the modelled
 *  `toolCall`, never the wire object. `raw` is still carried on every update,
 *  and deliberately holds nothing this panel reads. */
function tool(
  kind: "tool_call" | "tool_call_update",
  call: AgentToolCall,
): AgentSessionUpdate {
  return { kind, toolCall: call, raw: { sessionUpdate: kind } };
}

/** A `plan` update, with the whole plan the agent reissued. */
function plan(entries: AgentPlanEntry[]): AgentSessionUpdate {
  return { kind: "plan", plan: entries, raw: { sessionUpdate: "plan" } };
}

let readCallSeq = 0;

/** A run of plain, non-diff tool calls — `readCalls(3)` gives three distinct
 *  `"read"`-kind calls, each its own `toolCallId`, none of them failed. */
function readCalls(
  count: number,
  overrides: Partial<AgentToolCall> = {},
): AgentSessionUpdate[] {
  return Array.from({ length: count }, () => {
    const id = `r${++readCallSeq}`;
    return tool("tool_call", {
      toolCallId: id,
      title: `Read file-${id}.ts`,
      kind: "read",
      status: "completed",
      ...overrides,
    });
  });
}

/** A tool call carrying a protocol diff — the one shape that breaks a
 *  {@link foldToolRuns} run regardless of run length. */
function editCall(toolCallId = "edit1"): AgentSessionUpdate {
  return tool("tool_call", {
    toolCallId,
    title: "Edit a.ts",
    kind: "edit",
    content: [
      { type: "diff", path: "src/a.ts", oldText: "old\n", newText: "new\n" },
    ],
  });
}

/** Any other kind, with nothing modelled on it. */
function other(kind: string): AgentSessionUpdate {
  return { kind, raw: { sessionUpdate: kind } };
}

function fold(updates: AgentSessionUpdate[], from = emptyTranscript) {
  return updates.reduce(applyUpdate, from);
}

describe("applyUpdate — streaming text", () => {
  it("groups consecutive chunks that share a messageId into one message", () => {
    const t = fold([
      chunk("agent_message_chunk", "Hello", "m1"),
      chunk("agent_message_chunk", ", ", "m1"),
      chunk("agent_message_chunk", "world.", "m1"),
    ]);
    expect(t.entries).toHaveLength(1);
    expect(t.entries[0]).toMatchObject({
      type: "message",
      role: "agent",
      messageId: "m1",
      text: "Hello, world.",
    });
  });

  it("starts a new message when the messageId changes", () => {
    const t = fold([
      chunk("agent_message_chunk", "first", "m1"),
      chunk("agent_message_chunk", "second", "m2"),
    ]);
    expect(t.entries.map((e) => (e as MessageEntry).text)).toEqual([
      "first",
      "second",
    ]);
  });

  it("keeps thoughts and answers in separate entries", () => {
    const t = fold([
      chunk("agent_thought_chunk", "hmm", "m1"),
      chunk("agent_message_chunk", "answer", "m1"),
    ]);
    expect(t.entries.map((e) => (e as MessageEntry).role)).toEqual([
      "thought",
      "agent",
    ]);
  });

  it("merges a run of id-less chunks, the shape an agent that omits messageId sends", () => {
    const t = fold([
      chunk("agent_message_chunk", "one"),
      chunk("agent_message_chunk", " word"),
      chunk("agent_message_chunk", " per token"),
    ]);
    expect(t.entries).toHaveLength(1);
    expect((t.entries[0] as MessageEntry).text).toBe("one word per token");
  });

  it("ends a text run at a tool call, so the next text is a new message", () => {
    const t = fold([
      chunk("agent_message_chunk", "before", "m1"),
      tool("tool_call", { toolCallId: "c1", title: "Read file" }),
      chunk("agent_message_chunk", "after", "m1"),
    ]);
    expect(t.entries.map((e) => e.type)).toEqual([
      "message",
      "tool",
      "message",
    ]);
  });

  it("gives every entry a unique key, including two adjacent id-less runs", () => {
    const t = fold([
      chunk("agent_thought_chunk", "a"),
      chunk("agent_message_chunk", "b"),
      chunk("agent_thought_chunk", "c"),
    ]);
    const keys = t.entries.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("ignores an empty chunk rather than opening a blank bubble", () => {
    const t = applyUpdate(emptyTranscript, chunk("agent_message_chunk", ""));
    expect(t).toBe(emptyTranscript);
  });

  it("streams a thought chunk that is just a newline (a provider with nothing real to say) as blank text", () => {
    const t = fold([chunk("agent_thought_chunk", "\n", "m1")]);
    expect((t.entries[0] as MessageEntry).text).toBe("\n");
  });
});

describe("applyUpdate — journaled user message timestamp", () => {
  it("reads a journal-replayed user_message_chunk's timestamp into sentAt", () => {
    const iso = "2026-09-07T19:38:00.000Z";
    const t = applyUpdate(emptyTranscript, {
      kind: "user_message_chunk",
      text: "what model is this?",
      timestamp: iso,
      raw: {},
    });
    expect((t.entries[0] as MessageEntry).sentAt).toBe(Date.parse(iso));
  });

  it("leaves sentAt unset for a user chunk with no timestamp (live-stream shape)", () => {
    const t = applyUpdate(emptyTranscript, chunk("user_message_chunk", "hi"));
    expect("sentAt" in (t.entries[0] as object)).toBe(false);
  });

  it("never reads timestamp for a non-user role, even if present", () => {
    const t = applyUpdate(emptyTranscript, {
      kind: "agent_message_chunk",
      text: "hello",
      timestamp: "2026-09-07T19:38:00.000Z",
      raw: {},
    });
    expect("sentAt" in (t.entries[0] as object)).toBe(false);
  });
});

describe("applyUpdate — tool calls", () => {
  it("renders a tool call with its content lines", () => {
    const t = fold([
      tool("tool_call", {
        toolCallId: "c1",
        title: "Read src/app.ts",
        kind: "read",
        status: "pending",
        content: [{ type: "content", content: { type: "text", text: "line" } }],
      }),
    ]);
    expect(t.entries[0]).toMatchObject({
      type: "tool",
      toolCallId: "c1",
      title: "Read src/app.ts",
      toolKind: "read",
      status: "pending",
      lines: ["line"],
    });
  });

  it("keeps a protocol diff on the row so the panel can paint a hunk", () => {
    const t = fold([
      tool("tool_call", {
        toolCallId: "c1",
        title: "Edit a.ts",
        kind: "edit",
        content: [
          {
            type: "diff",
            path: "src/a.ts",
            oldText: "old\n",
            newText: "new\n",
          },
        ],
      }),
    ]);
    expect(t.entries[0]).toMatchObject({
      diffs: [{ path: "src/a.ts", oldText: "old\n", newText: "new\n" }],
    });
  });

  it("patches the existing row in place on tool_call_update", () => {
    const t = fold([
      tool("tool_call", {
        toolCallId: "c1",
        title: "Run tests",
        status: "pending",
      }),
      tool("tool_call_update", { toolCallId: "c1", status: "completed" }),
    ]);
    expect(t.entries).toHaveLength(1);
    expect(t.entries[0]).toMatchObject({
      status: "completed",
      title: "Run tests",
    });
  });

  it("does not blank existing content when an update carries none", () => {
    const t = fold([
      tool("tool_call", {
        toolCallId: "c1",
        title: "Run tests",
        content: [{ type: "content", content: { type: "text", text: "ok" } }],
      }),
      tool("tool_call_update", { toolCallId: "c1", status: "completed" }),
    ]);
    expect((t.entries[0] as ToolEntry).lines).toEqual(["ok"]);
  });

  it("creates a row for an update whose tool_call never arrived", () => {
    const t = fold([
      tool("tool_call_update", { toolCallId: "orphan", status: "failed" }),
    ]);
    expect(t.entries[0]).toMatchObject({
      type: "tool",
      toolCallId: "orphan",
      status: "failed",
      title: "Tool call",
    });
  });

  it("keeps two different tool calls apart", () => {
    const t = fold([
      tool("tool_call", { toolCallId: "c1", title: "A" }),
      tool("tool_call", { toolCallId: "c2", title: "B" }),
      tool("tool_call_update", { toolCallId: "c1", status: "completed" }),
    ]);
    expect(t.entries).toHaveLength(2);
    expect((t.entries[0] as ToolEntry).status).toBe("completed");
    expect((t.entries[1] as ToolEntry).status).toBe("pending");
  });

  it("carries rawInput through", () => {
    const t = fold([
      tool("tool_call", {
        toolCallId: "c1",
        title: "Shell",
        rawInput: { command: "ls -la" },
      }),
    ]);
    expect((t.entries[0] as ToolEntry).rawInput).toEqual({
      command: "ls -la",
    });
  });

  it("does not blank rawInput when an update carries none", () => {
    const t = fold([
      tool("tool_call", { toolCallId: "c1", title: "Shell", rawInput: "ls" }),
      tool("tool_call_update", { toolCallId: "c1", status: "completed" }),
    ]);
    expect((t.entries[0] as ToolEntry).rawInput).toBe("ls");
  });
});

describe("applyUpdate — plan", () => {
  it("renders the plan rows", () => {
    const t = fold([
      plan([
        { content: "Read the code", status: "completed", priority: "high" },
        { content: "Write the fix", status: "in_progress" },
      ]),
    ]);
    expect(t.entries).toHaveLength(1);
    expect((t.entries[0] as PlanEntry).rows).toEqual([
      { content: "Read the code", status: "completed", priority: "high" },
      { content: "Write the fix", status: "in_progress" },
    ]);
  });

  it("replaces the plan in place — the agent reissues it in full", () => {
    const t = fold([
      plan([{ content: "one", status: "pending" }]),
      chunk("agent_message_chunk", "working", "m1"),
      plan([{ content: "one", status: "completed" }]),
    ]);
    expect(t.entries.filter((e) => e.type === "plan")).toHaveLength(1);
    expect((t.entries[0] as PlanEntry).rows[0]!.status).toBe("completed");
  });

  it("ignores a first plan with no usable rows", () => {
    const t = applyUpdate(emptyTranscript, plan([]));
    expect(t).toBe(emptyTranscript);
  });
});

describe("applyUpdate — tolerance", () => {
  it("returns the same transcript for a kind it does not render", () => {
    const t = fold([chunk("agent_message_chunk", "hi", "m1")]);
    const after = applyUpdate(t, other("available_commands_update"));
    expect(after).toBe(t);
  });

  it("does not throw on a vendor kind nobody has seen before", () => {
    expect(() =>
      applyUpdate(emptyTranscript, other("_vendor/something_new")),
    ).not.toThrow();
  });

  // The wire-level garbage this used to be fed is now caught upstream: the SDK
  // drops a tool call it cannot give an id, so what reaches the panel is a
  // `tool_call` with no `toolCall` at all. It is still a row, not a crash and
  // not a silent drop. (Malformed-field coverage lives with the parser, in
  // `acp-update-model.test.ts`.)
  it("survives a tool_call the SDK could not model", () => {
    const t = applyUpdate(emptyTranscript, other("tool_call"));
    expect(t.entries[0]).toMatchObject({
      type: "tool",
      toolCallId: "",
      title: "Tool call",
      lines: [],
    });
  });
});

describe("appendUserMessage / appendNotice", () => {
  it("appends the user's own prompt, which the stream never echoes", () => {
    const t = appendUserMessage(emptyTranscript, "explain this repo");
    expect(t.entries[0]).toMatchObject({
      type: "message",
      role: "user",
      text: "explain this repo",
    });
  });

  it("records attachment names on the user message, omitting the field when empty", () => {
    expect(
      (
        appendUserMessage(emptyTranscript, "look", ["a.ts", "b.ts"])
          .entries[0] as MessageEntry
      ).attachments,
    ).toEqual(["a.ts", "b.ts"]);
    expect(
      "attachments" in
        (appendUserMessage(emptyTranscript, "look", []).entries[0] as object),
    ).toBe(false);
  });

  it("records when the user sent the prompt, for the hover timestamp", () => {
    const before = Date.now();
    const sentAt = (
      appendUserMessage(emptyTranscript, "hi").entries[0] as MessageEntry
    ).sentAt;
    expect(sentAt).toBeGreaterThanOrEqual(before);
    expect(sentAt).toBeLessThanOrEqual(Date.now());
  });

  it("keeps a user prompt separate from the agent's reply", () => {
    let t: Transcript = appendUserMessage(emptyTranscript, "hi");
    t = applyUpdate(t, chunk("agent_message_chunk", "hello", "m1"));
    expect(t.entries.map((e) => (e as MessageEntry).role)).toEqual([
      "user",
      "agent",
    ]);
  });

  it("appends a toned notice", () => {
    const t = appendNotice(emptyTranscript, "error", "boom");
    expect(t.entries[0]).toMatchObject({
      type: "notice",
      tone: "error",
      text: "boom",
    });
  });
});

describe("userPromptHistory", () => {
  it("lists the user's own prompts, oldest first, skipping agent replies", () => {
    let t: Transcript = appendUserMessage(emptyTranscript, "first");
    t = applyUpdate(t, chunk("agent_message_chunk", "hi there", "m1"));
    t = appendUserMessage(t, "second");
    expect(userPromptHistory(t)).toEqual(["first", "second"]);
  });

  it("skips a blank/whitespace-only prompt (an attachment-only send)", () => {
    const t = appendUserMessage(emptyTranscript, "   ", ["a.ts"]);
    expect(userPromptHistory(t)).toEqual([]);
  });

  it("is empty for a fresh transcript", () => {
    expect(userPromptHistory(emptyTranscript)).toEqual([]);
  });

  it("keeps only a resent prompt's most recent send, in that position", () => {
    let t: Transcript = appendUserMessage(emptyTranscript, "yes");
    t = appendUserMessage(t, "do the thing");
    t = appendUserMessage(t, "yes");
    expect(userPromptHistory(t)).toEqual(["do the thing", "yes"]);
  });
});

describe("formatToolInput", () => {
  it("shows nothing for undefined, null, or an empty object", () => {
    expect(formatToolInput(undefined)).toBeUndefined();
    expect(formatToolInput(null)).toBeUndefined();
    expect(formatToolInput({})).toBeUndefined();
  });

  it("prints a bare string as-is", () => {
    expect(formatToolInput("ls -la")).toBe("ls -la");
  });

  it("shows nothing for an empty string", () => {
    expect(formatToolInput("")).toBeUndefined();
  });

  it("pretty-prints an object", () => {
    expect(formatToolInput({ command: "ls -la" })).toBe(
      JSON.stringify({ command: "ls -la" }, null, 2),
    );
  });
});

describe("formatMessageSentAt", () => {
  it("combines a short date and a short time", () => {
    const sentAt = Date.parse("2026-09-07T15:38:00");
    const date = new Date(sentAt);
    expect(formatMessageSentAt(sentAt)).toBe(
      `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`,
    );
  });
});

describe("toolContentLines", () => {
  it("returns nothing when the call carried no content", () => {
    expect(toolContentLines(undefined)).toEqual([]);
    expect(toolContentLines([])).toEqual([]);
  });

  it("names a diff by its path", () => {
    expect(toolContentLines([{ type: "diff", path: "src/a.ts" }])).toEqual([
      "diff src/a.ts",
    ]);
  });

  it("names a block it cannot expand rather than dropping it", () => {
    expect(
      toolContentLines([
        { type: "content", content: { type: "image", mimeType: "image/png" } },
        { type: "terminal", terminalId: "t1" },
      ]),
    ).toEqual(["[image]", "[terminal]"]);
  });
});

describe("toolOutputIsMarkdown", () => {
  it("treats a fenced block as markdown — the ```console shell-result case", () => {
    expect(toolOutputIsMarkdown("```console\nls\n```")).toBe(true);
  });

  it("leaves JSON and plain stdout literal, so underscores stay underscores", () => {
    expect(toolOutputIsMarkdown('{\n  "project_path": "/tmp"\n}')).toBe(false);
    expect(toolOutputIsMarkdown("agent-monitor:  30")).toBe(false);
    expect(toolOutputIsMarkdown("")).toBe(false);
  });
});

describe("isBlankMessageText", () => {
  it("is blank for empty text", () => {
    expect(isBlankMessageText("")).toBe(true);
  });

  it("is blank for a lone newline — the `omlx/Gemma 4 26B` throwaway-chunk case", () => {
    expect(isBlankMessageText("\n")).toBe(true);
  });

  it("is blank for whitespace-only text", () => {
    expect(isBlankMessageText("   \n\t\n  ")).toBe(true);
  });

  it("is not blank once there is real text", () => {
    expect(isBlankMessageText("\nLet me check the README.\n")).toBe(false);
  });
});

describe("planRows", () => {
  it("fills in the status the protocol leaves optional", () => {
    expect(planRows([{ content: "real" }])).toEqual([
      { content: "real", status: "pending" },
    ]);
  });

  it("returns nothing when the update carried no plan", () => {
    expect(planRows(undefined)).toEqual([]);
  });
});

describe("toolStatusTone", () => {
  it("maps the protocol statuses", () => {
    expect(toolStatusTone("pending")).toBe("neutral");
    expect(toolStatusTone("in_progress")).toBe("accent");
    expect(toolStatusTone("completed")).toBe("ok");
    expect(toolStatusTone("failed")).toBe("err");
  });

  it("reads an unknown status as neutral rather than guessing", () => {
    expect(toolStatusTone("vendor_thing")).toBe("neutral");
  });
});

describe("closeDanglingTools", () => {
  it("fails a tool call still pending or in progress", () => {
    const t = fold([
      tool("tool_call", {
        toolCallId: "c1",
        title: "Read a.ts",
        status: "pending",
      }),
      tool("tool_call", {
        toolCallId: "c2",
        title: "Edit b.ts",
        status: "in_progress",
      }),
    ]);
    const closed = closeDanglingTools(t);
    expect(closed.entries.map((e) => (e as ToolEntry).status)).toEqual([
      "failed",
      "failed",
    ]);
  });

  it("leaves a completed or already-failed call alone", () => {
    const t = fold([
      tool("tool_call", { toolCallId: "c1", title: "a", status: "completed" }),
      tool("tool_call", { toolCallId: "c2", title: "b", status: "failed" }),
    ]);
    expect(closeDanglingTools(t)).toBe(t);
  });

  it("returns the same reference when nothing needs closing", () => {
    expect(closeDanglingTools(emptyTranscript)).toBe(emptyTranscript);
  });
});

describe("stopReasonNotice", () => {
  it("says nothing for a normal end of turn", () => {
    expect(stopReasonNotice("end_turn")).toBeUndefined();
  });

  it("reports a refusal as a warning", () => {
    expect(stopReasonNotice("refusal")).toMatchObject({ tone: "warn" });
  });

  it("reports a cancel as information, not a failure", () => {
    expect(stopReasonNotice("cancelled")).toMatchObject({ tone: "info" });
  });

  it("reports an unknown stop reason verbatim", () => {
    expect(stopReasonNotice("something_else")?.text).toContain(
      "something_else",
    );
  });
});

// RFC 0043 finding 1 — grouping entries into turns for spacing + a footer.
describe("groupTurns", () => {
  it("is empty for an empty transcript", () => {
    expect(groupTurns([])).toEqual([]);
  });

  it("groups a user message with everything up to the next one", () => {
    const t = fold([
      chunk("user_message_chunk", "hi", "u1"),
      chunk("agent_message_chunk", "hello", "a1"),
      tool("tool_call", { toolCallId: "1", title: "Shell" }),
      chunk("user_message_chunk", "thanks", "u2"),
      chunk("agent_message_chunk", "np", "a2"),
    ]);
    const turns = groupTurns(t.entries);
    expect(turns).toHaveLength(2);
    expect(turns[0]?.user).toMatchObject({ role: "user", text: "hi" });
    expect(turns[0]?.rest.map((e) => e.type)).toEqual(["message", "tool"]);
    expect(turns[1]?.user).toMatchObject({ role: "user", text: "thanks" });
    expect(turns[1]?.rest.map((e) => e.type)).toEqual(["message"]);
  });

  it("gives a leading turn (no user entry) to content before any user message", () => {
    const t = fold([chunk("agent_message_chunk", "hello", "a1")]);
    const turns = groupTurns(t.entries);
    expect(turns).toHaveLength(1);
    expect(turns[0]?.user).toBeUndefined();
    expect(turns[0]?.rest.map((e) => e.type)).toEqual(["message"]);
  });

  it("keeps a keyless trailing turn for a user message with no reply yet", () => {
    const t = fold([chunk("user_message_chunk", "hi", "u1")]);
    const turns = groupTurns(t.entries);
    expect(turns).toHaveLength(1);
    expect(turns[0]?.user).toMatchObject({ text: "hi" });
    expect(turns[0]?.rest).toEqual([]);
  });
});

describe("sameTurn", () => {
  const base = [
    chunk("user_message_chunk", "hi", "u1"),
    chunk("agent_message_chunk", "hello", "a1"),
    tool("tool_call", { toolCallId: "1", title: "Shell" }),
    chunk("user_message_chunk", "thanks", "u2"),
    chunk("agent_message_chunk", "np", "a2"),
  ];

  it("holds across a re-projection of an unchanged transcript", () => {
    const t = fold(base);
    const a = groupTurns(t.entries);
    const b = groupTurns(t.entries);
    // The projection rebuilds the objects, so this is exactly the case the
    // default shallow compare would miss.
    expect(a[0]).not.toBe(b[0]);
    expect(a.every((turn, i) => sameTurn(turn, b[i]!))).toBe(true);
  });

  it("holds for earlier turns when the last one streams on", () => {
    const t = fold(base);
    const before = groupTurns(t.entries);
    const after = groupTurns(
      fold([chunk("agent_message_chunk", " problem", "a2")], t).entries,
    );
    expect(sameTurn(before[0]!, after[0]!)).toBe(true);
    expect(sameTurn(before[1]!, after[1]!)).toBe(false);
  });

  it("fails for the turn whose tool call was patched in place", () => {
    const t = fold(base);
    const before = groupTurns(t.entries);
    const after = groupTurns(
      fold(
        [tool("tool_call_update", { toolCallId: "1", status: "completed" })],
        t,
      ).entries,
    );
    expect(sameTurn(before[0]!, after[0]!)).toBe(false);
    expect(sameTurn(before[1]!, after[1]!)).toBe(true);
  });

  it("fails for a turn that gained an entry", () => {
    const t = fold(base);
    const before = groupTurns(t.entries);
    const after = groupTurns(
      fold([tool("tool_call", { toolCallId: "2", title: "Read" })], t).entries,
    );
    expect(before[1]?.rest).toHaveLength(1);
    expect(after[1]?.rest).toHaveLength(2);
    expect(sameTurn(before[1]!, after[1]!)).toBe(false);
  });

  it("fails when a new turn takes the same key as an old one's position", () => {
    // Turn keys are positional (`t0`, `t1`, …), so a turn can keep its key
    // while being an entirely different turn — the entry compare is what
    // catches that, not the key.
    const a = groupTurns(
      fold([chunk("user_message_chunk", "hi", "u1")]).entries,
    );
    const b = groupTurns(
      fold([chunk("user_message_chunk", "different", "u9")]).entries,
    );
    expect(a[0]?.key).toBe(b[0]?.key);
    expect(sameTurn(a[0]!, b[0]!)).toBe(false);
  });
});

describe("foldToolRuns", () => {
  it("is empty for an empty transcript", () => {
    expect(foldToolRuns([])).toEqual([]);
  });

  it("leaves a run shorter than the threshold alone", () => {
    const t = fold(readCalls(TOOL_GROUP_THRESHOLD - 1));
    const folded = foldToolRuns(t.entries);
    expect(folded.map((e) => e.type)).toEqual(
      Array(TOOL_GROUP_THRESHOLD - 1).fill("tool"),
    );
  });

  it("folds a run at or beyond the threshold into one group", () => {
    const t = fold(readCalls(TOOL_GROUP_THRESHOLD));
    const folded = foldToolRuns(t.entries);
    expect(folded).toHaveLength(1);
    const group = folded[0] as ToolGroupEntry;
    expect(group.type).toBe("tool-group");
    expect(group.tools).toHaveLength(TOOL_GROUP_THRESHOLD);
  });

  it("breaks the run on a diff-producing call and resumes after it", () => {
    const t = fold([
      ...readCalls(TOOL_GROUP_THRESHOLD),
      editCall(),
      ...readCalls(TOOL_GROUP_THRESHOLD),
    ]);
    const folded = foldToolRuns(t.entries);
    expect(folded.map((e) => e.type)).toEqual([
      "tool-group",
      "tool",
      "tool-group",
    ]);
    expect((folded[1] as ToolEntry).diffs).toHaveLength(1);
  });

  it("never folds a run the diff-producing call keeps under the threshold", () => {
    const t = fold([...readCalls(3), editCall(), ...readCalls(3)]);
    const folded = foldToolRuns(t.entries);
    expect(folded.map((e) => e.type)).toEqual([
      "tool",
      "tool",
      "tool",
      "tool",
      "tool",
      "tool",
      "tool",
    ]);
  });

  it("breaks the run on a non-tool entry too", () => {
    const t = fold([
      ...readCalls(3),
      chunk("agent_message_chunk", "hang on", "a1"),
      ...readCalls(3),
    ]);
    const folded = foldToolRuns(t.entries);
    expect(folded.map((e) => e.type)).toEqual([
      "tool",
      "tool",
      "tool",
      "message",
      "tool",
      "tool",
      "tool",
    ]);
  });

  it("breaks the run on a failed call and resumes after it", () => {
    const t = fold([
      ...readCalls(TOOL_GROUP_THRESHOLD),
      ...readCalls(1, { status: "failed" }),
      ...readCalls(TOOL_GROUP_THRESHOLD),
    ]);
    const folded = foldToolRuns(t.entries);
    expect(folded.map((e) => e.type)).toEqual([
      "tool-group",
      "tool",
      "tool-group",
    ]);
    expect((folded[1] as ToolEntry).status).toBe("failed");
  });

  it("never folds a run the failed call keeps under the threshold", () => {
    const t = fold([
      ...readCalls(3),
      ...readCalls(1, { status: "failed" }),
      ...readCalls(3),
    ]);
    const folded = foldToolRuns(t.entries);
    expect(folded.map((e) => e.type)).toEqual([
      "tool",
      "tool",
      "tool",
      "tool",
      "tool",
      "tool",
      "tool",
    ]);
  });
});

describe("toolGroupLabel", () => {
  it("summarizes the group by kind, most-frequent first", () => {
    const t = fold([
      ...readCalls(3),
      ...Array.from({ length: 14 }, (_, i) =>
        tool("tool_call", {
          toolCallId: `s${i}`,
          title: `Run step ${i}`,
          kind: "execute",
        }),
      ),
    ]);
    const group = foldToolRuns(t.entries)[0] as ToolGroupEntry;
    expect(toolGroupLabel(group)).toBe("14 Shell · 3 Read");
  });

  it("falls back to Tool for a call with no kind", () => {
    const t = fold(readCalls(TOOL_GROUP_THRESHOLD, { kind: undefined }));
    const group = foldToolRuns(t.entries)[0] as ToolGroupEntry;
    expect(toolGroupLabel(group)).toBe(`${TOOL_GROUP_THRESHOLD} Tool`);
  });
});

describe("nextEntryKey", () => {
  it("predicts the key appendEntry will give the next entry", () => {
    expect(nextEntryKey(emptyTranscript)).toBe("e1");
    const t = fold([chunk("user_message_chunk", "hi", "u1")]);
    expect(nextEntryKey(t)).toBe(`e${t.seq + 1}`);
    const next = appendUserMessage(t, "again");
    expect(next.entries[next.entries.length - 1]?.key).toBe(nextEntryKey(t));
  });
});

describe("elapsedLabel", () => {
  it("formats seconds under a minute", () => {
    expect(elapsedLabel(18_000)).toBe("18s");
  });

  it("formats a duration at or over a minute as minutes and seconds", () => {
    expect(elapsedLabel(90_000)).toBe("1m 30s");
  });

  it("rounds to the nearest second", () => {
    expect(elapsedLabel(1_700)).toBe("2s");
  });

  it("floors a negative duration to zero rather than reading backwards", () => {
    expect(elapsedLabel(-50)).toBe("0s");
  });
});

describe("workedForLabel", () => {
  it("prefixes the elapsed label", () => {
    expect(workedForLabel(18_000)).toBe("Worked for 18s");
    expect(workedForLabel(90_000)).toBe("Worked for 1m 30s");
  });
});

// RFC 0042 — the transcript journal replayed before subscribing to onUpdate.
describe("seedFromJournal", () => {
  it("is empty for an empty journal", () => {
    expect(seedFromJournal([])).toEqual(emptyTranscript);
  });

  it("folds journal entries through the same reducer as live updates", () => {
    const journal = [
      chunk("user_message_chunk", "are you there?", "m1"),
      chunk("agent_message_chunk", "yes, still here", "m2"),
    ];
    expect(seedFromJournal(journal)).toEqual(fold(journal));
  });
});

/**
 * RFC 0055 — delegated work.
 *
 * The four `AgentToolCall`s below are what the host's `parseToolCall` produces
 * for frames 12, 16, 19 and 20 of the committed probe capture
 * `scratchpad/acp-probe/captures/frames-2026-10-06T20-05-31-821Z.jsonl` — one
 * `toolCallId`, four frames, and the three facts scattered across three of
 * them. They are spelled out here rather than read off disk because this
 * package cannot import the host's parser (that is the boundary working), and
 * because a unit test must not depend on `scratchpad/` still existing.
 *
 * The shape is the whole point: the frame that says `"completed"` carries
 * neither marker, and the frame that carries the hand-off has no status at
 * all. If the reducer did not accumulate, no single frame would ever produce a
 * correct row.
 */
const DISPATCH_ID = "toolu_017w2qK7W5kVxwtS8365ecQW";

/** Frame 12 — opens with the generic `"Task"` title and the subagent marker. */
const dispatchOpen = tool("tool_call", {
  toolCallId: DISPATCH_ID,
  title: "Task",
  kind: "think",
  status: "pending",
  subagent: true,
});

/** Frame 16 — the agent has finished filling its arguments, so the title is
 *  now the subagent's own description. Marker still present. */
const dispatchTitled = tool("tool_call_update", {
  toolCallId: DISPATCH_ID,
  title: "Sleep then reply",
  kind: "think",
  subagent: true,
});

/** Frame 19 — the hand-off. No `status`, no subagent marker. */
const dispatchHandOff = tool("tool_call_update", {
  toolCallId: DISPATCH_ID,
  handedOff: true,
});

/** Frame 20 — the lie this proposal exists to stop rendering. */
const dispatchSettled = tool("tool_call_update", {
  toolCallId: DISPATCH_ID,
  status: "completed",
});

/** Frame 26 — a call the subagent made, pointing back at the dispatch. */
const delegatedCall = tool("tool_call", {
  toolCallId: "toolu_01VwTaeFYn8sVEYQPATUootm",
  title: "sleep 35",
  kind: "execute",
  status: "completed",
  parentToolCallId: DISPATCH_ID,
});

const FULL_DISPATCH = [
  dispatchOpen,
  dispatchTitled,
  dispatchHandOff,
  dispatchSettled,
];

function toolEntries(t: Transcript): ToolEntry[] {
  return t.entries.filter((e): e is ToolEntry => e.type === "tool");
}

describe("applyUpdate — delegated work accumulates across frames", () => {
  it("adds frames 12/16/19/20 up to one row that is a handed-off dispatch", () => {
    const rows = toolEntries(fold(FULL_DISPATCH));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      toolCallId: DISPATCH_ID,
      // Relabelled from the vendor's opening "Task" by the existing
      // nonEmpty-or-keep rule — no new mechanism needed.
      title: "Sleep then reply",
      subagent: true,
      handedOff: true,
      // The protocol status is still carried faithfully. What changes is that
      // `handedOff` now sits beside it, so the row can refuse to render it as
      // a finish.
      status: "completed",
    });
  });

  it("keeps the subagent marker through the frames that drop it", () => {
    // Frames 19 and 20 both omit it; a reducer that overwrote rather than
    // accumulated would lose the dispatch's identity right as it mattered.
    expect(toolEntries(fold(FULL_DISPATCH))[0]?.subagent).toBe(true);
    expect(
      toolEntries(fold([dispatchOpen, dispatchSettled]))[0]?.subagent,
    ).toBe(true);
  });

  it("keeps the hand-off through the frame that settles the status", () => {
    expect(toolEntries(fold(FULL_DISPATCH))[0]?.handedOff).toBe(true);
  });

  it("leaves an ordinary call's fields untouched", () => {
    const row = toolEntries(fold(readCalls(1)))[0]!;
    expect("subagent" in row).toBe(false);
    expect("handedOff" in row).toBe(false);
    expect("parentToolCallId" in row).toBe(false);
  });

  it("carries the facts on an update for a call whose tool_call never arrived", () => {
    // The real shape behind the append branch: a journal that starts
    // mid-delegation, or a dropped opening frame.
    const row = toolEntries(fold([dispatchHandOff]))[0]!;
    expect(row).toMatchObject({ toolCallId: DISPATCH_ID, handedOff: true });
  });

  it("re-derives the same facts from a journal replay as from the live stream", () => {
    // RFC 0042: the journal stores raw frames and replays them through this
    // same reducer, so these fields need no persistence of their own.
    const live = [...FULL_DISPATCH, delegatedCall];
    expect(seedFromJournal(live)).toEqual(fold(live));
  });
});

describe("closeDanglingTools — a handed-off dispatch is left alone", () => {
  it("does not fail a dispatch that was handed off", () => {
    // Deliberately not a special case in the sweep: the vendor already
    // settled the row to "completed", so the pending/in_progress filter never
    // reaches it. This test is what keeps that true.
    const t = fold(FULL_DISPATCH);
    expect(closeDanglingTools(t)).toBe(t);
    expect(toolEntries(closeDanglingTools(t))[0]?.status).toBe("completed");
  });

  it("still fails a dispatch the stream abandoned before the hand-off", () => {
    const t = fold([dispatchOpen]);
    expect(toolEntries(closeDanglingTools(t))[0]?.status).toBe("failed");
  });
});

describe("foldToolRuns — delegated work never folds out of sight", () => {
  it("breaks a run on a subagent dispatch, which becomes its own block", () => {
    const entries = fold([
      ...readCalls(TOOL_GROUP_THRESHOLD),
      ...FULL_DISPATCH,
      ...readCalls(TOOL_GROUP_THRESHOLD),
    ]).entries;
    const out = foldToolRuns(entries);
    expect(out.map((e) => e.type)).toEqual([
      "tool-group",
      "delegated-group",
      "tool-group",
    ]);
    expect((out[1] as DelegatedGroupEntry).dispatch.subagent).toBe(true);
  });

  it("breaks a run on a delegated call whose dispatch is elsewhere", () => {
    // No dispatch in this slice, so there is nothing to gather it under — it
    // renders on its own rather than folding into either neighbouring run.
    const entries = fold([
      ...readCalls(TOOL_GROUP_THRESHOLD),
      delegatedCall,
      ...readCalls(TOOL_GROUP_THRESHOLD),
    ]).entries;
    const out = foldToolRuns(entries);
    expect(out.map((e) => e.type)).toEqual([
      "tool-group",
      "tool",
      "tool-group",
    ]);
    expect((out[1] as ToolEntry).parentToolCallId).toBe(DISPATCH_ID);
  });

  it("never swallows a dispatch into a group, even in a long run", () => {
    const entries = fold([
      ...readCalls(TOOL_GROUP_THRESHOLD * 2),
      ...FULL_DISPATCH,
    ]).entries;
    for (const out of foldToolRuns(entries)) {
      if (out.type !== "tool-group") continue;
      expect(out.tools.some((x) => x.subagent)).toBe(false);
    }
  });

  it("folds an ordinary run exactly as it does today", () => {
    const entries = fold(readCalls(TOOL_GROUP_THRESHOLD)).entries;
    expect(foldToolRuns(entries).map((e) => e.type)).toEqual(["tool-group"]);
  });
});

describe("delegationView", () => {
  it("is the shared empty view when nothing is delegated", () => {
    expect(delegationView(fold(readCalls(3)))).toBe(emptyDelegationView);
  });

  it("names each dispatch by the title the wire settled on", () => {
    const view = delegationView(fold([...FULL_DISPATCH, delegatedCall]));
    expect(view.dispatchTitles.get(DISPATCH_ID)).toBe("Sleep then reply");
  });

  it("counts the calls made on each dispatch's behalf", () => {
    const second = tool("tool_call", {
      toolCallId: "child-2",
      title: "Read notes.md",
      kind: "read",
      status: "completed",
      parentToolCallId: DISPATCH_ID,
    });
    const view = delegationView(
      fold([...FULL_DISPATCH, delegatedCall, second]),
    );
    expect(view.delegatedCounts.get(DISPATCH_ID)).toBe(2);
  });

  it("resolves attribution across a turn boundary", () => {
    // The second observed regime: the parent's turn ends at the hand-off and
    // the subagent's calls arrive in a later, agent-initiated turn. Resolution
    // is by id, so it does not care which turn either side landed in.
    const t = fold([
      chunk("user_message_chunk", "delegate this", "m1"),
      ...FULL_DISPATCH,
      chunk("user_message_chunk", "anything yet?", "m2"),
      delegatedCall,
    ]);
    expect(groupTurns(t.entries)).toHaveLength(2);
    expect(delegationView(t).dispatchTitles.get(DISPATCH_ID)).toBe(
      "Sleep then reply",
    );
  });

  it("has no entry for a dispatch the transcript never saw", () => {
    // A journal replay that starts mid-delegation. The caller falls back to
    // rendering the call on its own rather than naming a dispatch it can't
    // find.
    const view = delegationView(fold([delegatedCall]));
    expect(view.dispatchTitles.has(DISPATCH_ID)).toBe(false);
    expect(view.delegatedCounts.get(DISPATCH_ID)).toBe(1);
  });
});

describe("delegationSignature", () => {
  it("is empty for a transcript with no delegation", () => {
    expect(delegationSignature(fold(readCalls(4)))).toBe("");
  });

  it("is unchanged by text streaming in around the delegation", () => {
    // The reason it exists: the view is a prop of every memoized row, so it
    // must keep its identity through the long stretches where only text moves.
    const base = fold(FULL_DISPATCH);
    const after = fold(
      [
        chunk("agent_message_chunk", "still waiting", "m9"),
        chunk("agent_message_chunk", " on the agent", "m9"),
      ],
      base,
    );
    expect(delegationSignature(after)).toBe(delegationSignature(base));
  });

  it("changes when a dispatch is relabelled or a delegated call arrives", () => {
    const opened = fold([dispatchOpen]);
    const titled = fold([dispatchTitled], opened);
    expect(delegationSignature(titled)).not.toBe(delegationSignature(opened));
    const withChild = fold([delegatedCall], titled);
    expect(delegationSignature(withChild)).not.toBe(
      delegationSignature(titled),
    );
  });
});

describe("dispatchLabel", () => {
  it("wraps the dispatch's own description", () => {
    expect(dispatchLabel("Sleep then reply")).toBe("Agent(Sleep then reply)");
  });

  it("still reads sensibly for a dispatch whose description never arrived", () => {
    // The title the wire did give, not nothing.
    expect(dispatchLabel("Task")).toBe("Agent(Task)");
  });
});

describe("isToolRunning", () => {
  const row = (
    o: Partial<ToolEntry>,
  ): Pick<ToolEntry, "status" | "handedOff"> =>
    ({ status: "pending", ...o }) as ToolEntry;

  it("is running while pending or in_progress", () => {
    expect(isToolRunning(row({ status: "pending" }))).toBe(true);
    expect(isToolRunning(row({ status: "in_progress" }))).toBe(true);
  });

  it("is not running once settled", () => {
    expect(isToolRunning(row({ status: "completed" }))).toBe(false);
    expect(isToolRunning(row({ status: "failed" }))).toBe(false);
  });

  // The contract `AgentToolCall.handedOff` states: a UI must not render such a
  // call as finished. It is equally not *running* — a third state. This is the
  // one owner of that rule, so both row renderers and the CSS agree.
  it("is not running once handed off, whatever the status says", () => {
    expect(isToolRunning(row({ status: "pending", handedOff: true }))).toBe(
      false,
    );
    expect(isToolRunning(row({ status: "in_progress", handedOff: true }))).toBe(
      false,
    );
    expect(isToolRunning(row({ status: "completed", handedOff: true }))).toBe(
      false,
    );
  });
});

describe("delegatedDispatchNotice", () => {
  const dispatched = fold(FULL_DISPATCH);

  it("counts a dispatch whose worker has not reported in", () => {
    // RFC 0057 turned this from a dispatch tally into an outstanding count.
    // With no lifecycle event for the worker, nothing is subtracted — "I
    // don't know" must never render as a finish.
    expect(delegatedDispatchNotice(dispatched)).toBe(
      "1 background agent working",
    );
  });

  it("pluralises", () => {
    const second = [
      tool("tool_call", {
        toolCallId: "d2",
        title: "Review the diff",
        kind: "think",
        subagent: true,
        status: "pending",
      }),
      tool("tool_call_update", { toolCallId: "d2", handedOff: true }),
      tool("tool_call_update", { toolCallId: "d2", status: "completed" }),
    ];
    expect(delegatedDispatchNotice(fold([...FULL_DISPATCH, ...second]))).toBe(
      "2 background agents working",
    );
  });

  it("is absent with no dispatch at all", () => {
    expect(delegatedDispatchNotice(fold(readCalls(3)))).toBeUndefined();
    expect(delegatedDispatchNotice(emptyTranscript)).toBeUndefined();
  });

  it("is absent before the hand-off — a dispatch being set up is not yet away", () => {
    expect(delegatedDispatchNotice(fold([dispatchOpen]))).toBeUndefined();
  });

  // The bug this replaced: the notice was gated on `AgentInfo.activity ===
  // "working"`, so between the parent's turn ending and the next notification
  // turn it vanished while subagents were demonstrably still working.
  it("does not depend on session activity, so it cannot flicker", () => {
    // Same entries, no activity argument to vary — the signature itself is the
    // guarantee. Kept as a test so reintroducing a liveness gate fails here.
    expect(delegatedDispatchNotice(dispatched)).toBe(
      delegatedDispatchNotice(dispatched),
    );
    expect(delegatedDispatchNotice.length).toBe(1);
  });

  // Scoped to the exchange: a transcript-wide tally grows without bound over a
  // long session and stops meaning anything.
  it("counts only dispatches since the last user message", () => {
    const t = fold([
      chunk("user_message_chunk", "first ask", "m1"),
      ...FULL_DISPATCH,
      chunk("user_message_chunk", "second ask", "m2"),
    ]);
    expect(delegatedDispatchNotice(t)).toBeUndefined();
  });

  it("counts a new exchange's dispatches on their own", () => {
    const second = [
      tool("tool_call", {
        toolCallId: "d9",
        title: "Later agent",
        kind: "think",
        subagent: true,
        status: "pending",
      }),
      tool("tool_call_update", { toolCallId: "d9", handedOff: true }),
    ];
    const t = fold([
      chunk("user_message_chunk", "first ask", "m1"),
      ...FULL_DISPATCH,
      chunk("user_message_chunk", "second ask", "m2"),
      ...second,
    ]);
    expect(delegatedDispatchNotice(t)).toBe("1 background agent working");
  });

  // `handedOff` is agent-agnostic by design — a backgrounded shell is expected
  // to set it without being a subagent. This line says "background agents".
  it("counts only subagent dispatches, not every handed-off call", () => {
    const shell = [
      tool("tool_call", {
        toolCallId: "sh1",
        title: "npm run dev",
        kind: "execute",
        status: "pending",
      }),
      tool("tool_call_update", { toolCallId: "sh1", handedOff: true }),
    ];
    // A handed-off shell alone produces no notice at all.
    expect(delegatedDispatchNotice(fold(shell))).toBeUndefined();
    // And it does not inflate the count beside a real dispatch.
    expect(delegatedDispatchNotice(fold([...FULL_DISPATCH, ...shell]))).toBe(
      "1 background agent working",
    );
  });

  it("never names a delegated agent", () => {
    // Per-agent news belongs on the row that dispatched it; the notice is an
    // aggregate, and naming one of several outstanding agents in it would only
    // raise the question of what the others are doing.
    expect(delegatedDispatchNotice(dispatched)).not.toContain(
      "Sleep then reply",
    );
  });

  // The countdown (RFC 0057). The old comment here argued at length that this
  // was impossible: nothing revisited a dispatch to report a finish, and with
  // several outstanding nothing said *which* one had finished. The AIR
  // `nativeSubagentSessions` capability answers both, so the count comes down.
  describe("counting down as workers report in", () => {
    /** A dispatch naming the worker it handed to — the capability-on shape. */
    const dispatchTo = (id: string, worker: string, title: string) => [
      tool("tool_call_update", {
        toolCallId: id,
        title,
        subagent: true,
        handedOff: true,
        subagentId: worker,
      }),
    ];
    const lifecycle = (
      worker: string,
      state: "started" | "completed" | "failed",
    ) =>
      ({
        kind:
          state === "started" ? "subagent_spawned" : "subagent_state_update",
        delegation: { subagentId: worker, state },
        raw: {},
      }) as AgentSessionUpdate;

    it("subtracts a worker that reported a terminal state", () => {
      const t = fold([
        ...dispatchTo("d1", "w1", "Sleep then reply"),
        ...dispatchTo("d2", "w2", "Review the diff"),
        lifecycle("w1", "started"),
        lifecycle("w2", "started"),
      ]);
      expect(delegatedDispatchNotice(t)).toBe("2 background agents working");
      const after = applyUpdate(t, lifecycle("w1", "completed"));
      expect(delegatedDispatchNotice(after)).toBe("1 background agent working");
    });

    it("disappears once every worker this exchange dispatched has finished", () => {
      const t = fold([
        ...dispatchTo("d1", "w1", "Sleep then reply"),
        lifecycle("w1", "started"),
        lifecycle("w1", "completed"),
      ]);
      expect(delegatedDispatchNotice(t)).toBeUndefined();
    });

    it("counts a failed worker as finished too — it is no longer working", () => {
      const t = fold([
        ...dispatchTo("d1", "w1", "Sleep then reply"),
        lifecycle("w1", "failed"),
      ]);
      expect(delegatedDispatchNotice(t)).toBeUndefined();
    });

    it("counts one worker reported twice as one", () => {
      // The generation repeat. Silo normalises the ids upstream, so both
      // arrivals land on one key and last-write-wins settles it.
      const t = fold([
        ...dispatchTo("d1", "w1", "Sleep then reply"),
        lifecycle("w1", "started"),
        lifecycle("w1", "completed"),
        lifecycle("w1", "started"),
        lifecycle("w1", "completed"),
      ]);
      expect(delegatedDispatchNotice(t)).toBeUndefined();
    });

    it("keeps counting a worker whose state Silo does not recognise", () => {
      // The host yields no `delegation` for an unknown state, so nothing is
      // subtracted — absence of a finish is never read as a finish.
      const t = fold([
        ...dispatchTo("d1", "w1", "Sleep then reply"),
        lifecycle("w1", "started"),
      ]);
      expect(delegatedDispatchNotice(t)).toBe("1 background agent working");
    });

    it("falls back to counting dispatches for an agent that names no worker", () => {
      // The capability-off path, byte-for-byte the pre-RFC-0057 behaviour: a
      // dispatch with no `subagentId` can never be told apart from one still
      // running, so it stays counted forever.
      expect(delegatedDispatchNotice(fold(FULL_DISPATCH))).toBe(
        "1 background agent working",
      );
    });

    it("ignores a lifecycle event for a worker this exchange did not dispatch", () => {
      // A worker from the previous exchange reporting in must not make this
      // exchange's notice go negative or vanish.
      const t = fold([
        ...dispatchTo("d1", "w1", "Sleep then reply"),
        lifecycle("w9", "completed"),
      ]);
      expect(delegatedDispatchNotice(t)).toBe("1 background agent working");
    });
  });
});

describe("groupDelegatedCalls", () => {
  /** A dispatch + its child, as two separate agents' work would arrive. */
  function dispatchOf(id: string, title: string) {
    return [
      tool("tool_call", {
        toolCallId: id,
        title,
        kind: "think",
        status: "pending",
        subagent: true,
      }),
      tool("tool_call_update", { toolCallId: id, handedOff: true }),
      tool("tool_call_update", { toolCallId: id, status: "completed" }),
    ];
  }
  function childOf(parent: string, id: string, title: string) {
    return tool("tool_call", {
      toolCallId: id,
      title,
      kind: "read",
      status: "completed",
      parentToolCallId: parent,
    });
  }

  it("returns the input untouched when nothing was delegated", () => {
    const entries = fold(readCalls(3)).entries;
    expect(groupDelegatedCalls(entries)).toBe(entries);
  });

  it("gathers a dispatch's calls under it", () => {
    const entries = fold([
      ...dispatchOf("d1", "Summarize tasks extension"),
      childOf("d1", "c1", "Read tasks/README.md"),
      childOf("d1", "c2", "Read tasks/package.json"),
    ]).entries;
    const out = groupDelegatedCalls(entries);
    expect(out).toHaveLength(1);
    const group = out[0] as DelegatedGroupEntry;
    expect(group.type).toBe("delegated-group");
    expect(group.dispatch.title).toBe("Summarize tasks extension");
    expect(group.work.map((c) => c.title)).toEqual([
      "Read tasks/README.md",
      "Read tasks/package.json",
    ]);
  });

  // The case from Dave's screenshot: seven agents dispatched up front, their
  // reads interleaving afterwards. Chronologically the first agent's reads sat
  // four rows below a *different* agent's dispatch.
  it("untangles several concurrent agents whose calls interleave", () => {
    const entries = fold([
      ...dispatchOf("d1", "Summarize tasks extension"),
      ...dispatchOf("d2", "Summarize local-web-viewer extension"),
      childOf("d1", "a1", "Read tasks/README.md"),
      childOf("d2", "b1", "Read local-web-viewer/README.md"),
      childOf("d1", "a2", "Read tasks/package.json"),
      childOf("d2", "b2", "Read local-web-viewer/package.json"),
    ]).entries;
    const out = groupDelegatedCalls(entries) as DelegatedGroupEntry[];
    expect(out.map((g) => g.dispatch.title)).toEqual([
      "Summarize tasks extension",
      "Summarize local-web-viewer extension",
    ]);
    expect(out[0]!.work.map((c) => c.title)).toEqual([
      "Read tasks/README.md",
      "Read tasks/package.json",
    ]);
    expect(out[1]!.work.map((c) => c.title)).toEqual([
      "Read local-web-viewer/README.md",
      "Read local-web-viewer/package.json",
    ]);
  });

  it("keeps each block where its dispatch appeared, and other entries in place", () => {
    const entries = fold([
      chunk("agent_message_chunk", "first, some prose", "m1"),
      ...dispatchOf("d1", "Agent one"),
      chunk("agent_message_chunk", "between the two", "m2"),
      ...dispatchOf("d2", "Agent two"),
      childOf("d1", "c1", "Read a.md"),
    ]).entries;
    expect(groupDelegatedCalls(entries).map((e) => e.type)).toEqual([
      "message",
      "delegated-group",
      "message",
      "delegated-group",
    ]);
  });

  it("heads a block for a dispatch whose calls have not arrived yet", () => {
    const out = groupDelegatedCalls(
      fold(dispatchOf("d1", "Agent one")).entries,
    );
    expect((out[0] as DelegatedGroupEntry).work).toEqual([]);
  });

  // The other observed regime, and the one thing this pass deliberately will
  // not do: a turn is a contiguous slice, so a call cannot be hoisted into a
  // turn it did not land in. It renders in place instead, carrying its label.
  it("leaves a delegated call alone when its dispatch is not in the slice", () => {
    const orphan = fold([childOf("d-elsewhere", "c1", "Read a.md")]).entries;
    const out = groupDelegatedCalls(orphan);
    expect(out).toHaveLength(1);
    expect(out[0]!.type).toBe("tool");
  });

  it("does not gather across a turn boundary", () => {
    const t = fold([
      chunk("user_message_chunk", "delegate this", "m1"),
      ...dispatchOf("d1", "Agent one"),
      chunk("user_message_chunk", "anything yet?", "m2"),
      childOf("d1", "c1", "Read a.md"),
    ]);
    const turns = groupTurns(t.entries);
    expect(turns).toHaveLength(2);
    // The dispatch's turn gets a block with no calls in it...
    const first = foldToolRuns(turns[0]!.rest);
    expect((first[0] as DelegatedGroupEntry).work).toEqual([]);
    // ...and the later turn renders the child on its own, not relocated.
    const second = foldToolRuns(turns[1]!.rest);
    expect(second.map((e) => e.type)).toEqual(["tool"]);
    expect((second[0] as ToolEntry).parentToolCallId).toBe("d1");
  });
});

describe("foldToolRuns — delegated blocks and run folding compose", () => {
  it("does not let a gathered call break an unrelated run", () => {
    // The delegated calls are removed from the stream before run-folding, so
    // a long run of ordinary calls on either side still folds.
    const entries = fold([
      ...readCalls(TOOL_GROUP_THRESHOLD),
      tool("tool_call", {
        toolCallId: "d1",
        title: "Agent one",
        kind: "think",
        status: "completed",
        subagent: true,
      }),
      tool("tool_call", {
        toolCallId: "c1",
        title: "Read a.md",
        kind: "read",
        status: "completed",
        parentToolCallId: "d1",
      }),
      ...readCalls(TOOL_GROUP_THRESHOLD),
    ]).entries;
    expect(foldToolRuns(entries).map((e) => e.type)).toEqual([
      "tool-group",
      "delegated-group",
      "tool-group",
    ]);
  });
});

/**
 * RFC 0057. A worker's identity and fate reach the panel as modelled fields,
 * so the panel can say *which* agent finished and keep saying it — the two
 * things RFC 0055 could not do.
 */
describe("per-worker state and attribution", () => {
  const WORKER = "a26fef4c40ae0ac1d";
  const DISPATCH = "toolu_01UVpzoKuVLPGTXMKH7i2Puz";

  /** The dispatch as the capability-on stream sends it: one `tool_call_update`
   *  with no opening call, no status, and the worker named in its place. */
  const capDispatch = tool("tool_call_update", {
    toolCallId: DISPATCH,
    title: "Background sleep task",
    subagent: true,
    handedOff: true,
    subagentId: WORKER,
  });

  const lifecycle = (
    state: "started" | "completed" | "failed" | "cancelled" | "disconnected",
    worker = WORKER,
  ) =>
    ({
      kind: state === "started" ? "subagent_spawned" : "subagent_state_update",
      delegation: { subagentId: worker, state },
      raw: {},
    }) as AgentSessionUpdate;

  /** A message the worker itself streamed, attributed by the host. */
  const childChunk = (text: string, messageId = "child-msg") =>
    ({
      kind: "agent_message_chunk",
      text,
      messageId,
      subagentId: WORKER,
      raw: {},
    }) as AgentSessionUpdate;

  describe("applyUpdate — the lifecycle", () => {
    it("records a worker's state without adding a transcript row", () => {
      // A worker appearing is not news; its finishing is news about the row
      // that already exists.
      const t = fold([lifecycle("started")]);
      expect(t.entries).toHaveLength(0);
      expect(t.delegations.get(WORKER)).toBe("started");
    });

    it("takes the latest word on a worker", () => {
      const t = fold([lifecycle("started"), lifecycle("completed")]);
      expect(t.delegations.get(WORKER)).toBe("completed");
    });

    it("keeps workers apart", () => {
      const t = fold([lifecycle("completed", "w1"), lifecycle("failed", "w2")]);
      expect(t.delegations.get("w1")).toBe("completed");
      expect(t.delegations.get("w2")).toBe("failed");
    });

    it("carries the state through every other kind of update", () => {
      // The reducer rebuilds the transcript on each frame; dropping the map
      // there would lose a finish to the next streamed chunk.
      const t = fold([
        lifecycle("completed"),
        chunk("agent_message_chunk", "and now", "m1"),
        tool("tool_call", { toolCallId: "t1", title: "Read x", status: "ok" }),
        tool("tool_call_update", { toolCallId: "t1", status: "completed" }),
      ]);
      expect(t.delegations.get(WORKER)).toBe("completed");
    });
  });

  describe("the dispatch row carries its worker's id", () => {
    it("accumulates subagentId across frames", () => {
      // The id arrives on the hand-off frame, not the opening one, so the row
      // must accumulate it exactly as it accumulates `subagent`.
      const t = fold([
        tool("tool_call", {
          toolCallId: DISPATCH,
          title: "Task",
          subagent: true,
          status: "pending",
        }),
        tool("tool_call_update", {
          toolCallId: DISPATCH,
          handedOff: true,
          subagentId: WORKER,
        }),
        tool("tool_call_update", { toolCallId: DISPATCH, status: "completed" }),
      ]);
      expect((t.entries[0] as ToolEntry).subagentId).toBe(WORKER);
    });
  });

  describe("delegationOutcome", () => {
    it("reports the worker's terminal state", () => {
      const t = fold([capDispatch, lifecycle("completed")]);
      expect(delegationOutcome(t.entries[0] as ToolEntry, t.delegations)).toBe(
        "completed",
      );
    });

    it("reports nothing while the worker is still working", () => {
      const t = fold([capDispatch, lifecycle("started")]);
      expect(
        delegationOutcome(t.entries[0] as ToolEntry, t.delegations),
      ).toBeUndefined();
    });

    it("reports nothing for an agent that never says", () => {
      // The capability-off path: the row renders as it did before, with the
      // `handed off` badge and no claim about the work.
      const t = fold(FULL_DISPATCH);
      const row = t.entries.find((e) => e.type === "tool") as ToolEntry;
      expect(delegationOutcome(row, t.delegations)).toBeUndefined();
    });

    it("keeps the terminal state after the turn moves on", () => {
      // A row is history. This is where a liveness-derived badge would break:
      // the session goes idle and the finish would disappear with it.
      const t = fold([
        capDispatch,
        lifecycle("completed"),
        chunk("agent_message_chunk", "Task finished.", "m9"),
        chunk("user_message_chunk", "thanks", "m10"),
        chunk("agent_message_chunk", "you're welcome", "m11"),
      ]);
      expect(delegationOutcome(t.entries[0] as ToolEntry, t.delegations)).toBe(
        "completed",
      );
    });

    it("survives a journal replay", () => {
      // The attribution is in the data, not in arrival order, so replaying the
      // same updates reconstructs the same outcome (RFC 0057 R9).
      const journal = [capDispatch, lifecycle("started"), lifecycle("failed")];
      const t = seedFromJournal(journal);
      expect(delegationOutcome(t.entries[0] as ToolEntry, t.delegations)).toBe(
        "failed",
      );
    });

    it("replays a journal written before this change", () => {
      // No `subagentId`, no `delegation` — it must still render, as the
      // parent's own frames, exactly as it always did.
      const t = seedFromJournal(FULL_DISPATCH);
      const row = t.entries.find((e) => e.type === "tool") as ToolEntry;
      expect(row.handedOff).toBe(true);
      expect(delegationOutcome(row, t.delegations)).toBeUndefined();
    });
  });

  describe("delegationStateTone", () => {
    it("distinguishes a result from a problem", () => {
      expect(delegationStateTone("completed")).toBe("ok");
      expect(delegationStateTone("failed")).toBe("err");
    });

    it("warns rather than failing for an end nobody chose", () => {
      // `"disconnected"` means *we don't know* how it ended, which should not
      // be dressed up as the agent having failed.
      expect(delegationStateTone("cancelled")).toBe("warn");
      expect(delegationStateTone("disconnected")).toBe("warn");
    });
  });

  describe("a worker's prose is attributed to it", () => {
    it("never merges a worker's run into the parent's", () => {
      // The mis-attribution this exists to prevent: the capture's worker says
      // "Command running in the background. I will reply FINISHED once it
      // completes." — which reads as the parent speaking if merged.
      const t = fold([
        chunk("agent_message_chunk", "launched", "shared"),
        childChunk(" I will reply FINISHED.", "shared"),
      ]);
      expect(t.entries).toHaveLength(2);
      expect((t.entries[0] as MessageEntry).text).toBe("launched");
      expect((t.entries[1] as MessageEntry).subagentId).toBe(WORKER);
    });

    it("still groups a worker's own consecutive chunks", () => {
      const t = fold([childChunk("Command "), childChunk("running.")]);
      expect(t.entries).toHaveLength(1);
      expect((t.entries[0] as MessageEntry).text).toBe("Command running.");
    });

    it("renders a worker's prose inside its dispatch's block", () => {
      const entries = fold([
        capDispatch,
        childChunk("Command running."),
      ]).entries;
      const out = groupDelegatedCalls(entries);
      expect(out).toHaveLength(1);
      const group = out[0] as DelegatedGroupEntry;
      expect(group.type).toBe("delegated-group");
      expect(group.work).toHaveLength(1);
      expect((group.work[0] as MessageEntry).text).toBe("Command running.");
    });

    it("keeps a worker's calls and prose in arrival order", () => {
      // The capture's order: the worker backgrounds a shell, then explains
      // itself. Splitting the two into separate lists would lose that.
      const entries = fold([
        capDispatch,
        tool("tool_call", {
          toolCallId: "c1",
          title: "sleep 30",
          status: "completed",
          parentToolCallId: DISPATCH,
        }),
        childChunk("Command running."),
      ]).entries;
      const group = groupDelegatedCalls(entries)[0] as DelegatedGroupEntry;
      expect(group.work.map((w) => w.type)).toEqual(["tool", "message"]);
    });

    it("leaves a worker's prose on its own when its dispatch is unknown", () => {
      // A replay starting mid-delegation. Dropping it would lose the only
      // record of what the worker said.
      const entries = fold([childChunk("Command running.")]).entries;
      expect(groupDelegatedCalls(entries)).toBe(entries);
    });

    it("leaves the parent's own prose in the flow of the transcript", () => {
      const entries = fold([
        capDispatch,
        chunk("agent_message_chunk", "Task finished.", "m1"),
      ]).entries;
      const out = groupDelegatedCalls(entries);
      expect(out).toHaveLength(2);
      expect((out[1] as MessageEntry).text).toBe("Task finished.");
    });
  });

  describe("delegationSignature", () => {
    it("changes when a worker reports in", () => {
      // The view and the notice are both memoized on this, so a finish that
      // did not move it would never reach the screen.
      const before = fold([capDispatch, lifecycle("started")]);
      const after = applyUpdate(before, lifecycle("completed"));
      expect(delegationSignature(after)).not.toBe(delegationSignature(before));
    });

    it("changes when a worker's prose is attributed", () => {
      const before = fold([capDispatch]);
      const after = applyUpdate(before, childChunk("Command running."));
      expect(delegationSignature(after)).not.toBe(delegationSignature(before));
    });

    it("is still unmoved by the parent's own text streaming", () => {
      const base = fold([capDispatch, lifecycle("started")]);
      const after = applyUpdate(
        base,
        chunk("agent_message_chunk", "still going", "m1"),
      );
      expect(delegationSignature(after)).toBe(delegationSignature(base));
    });
  });

  describe("delegationView", () => {
    it("passes the worker states through to the rows", () => {
      const t = fold([capDispatch, lifecycle("completed")]);
      expect(delegationView(t).delegations.get(WORKER)).toBe("completed");
    });

    it("is the shared empty view when there is no delegation at all", () => {
      expect(delegationView(fold(readCalls(3)))).toBe(emptyDelegationView);
    });
  });
});

/**
 * A delegated worker's rows are relocated into its dispatch's block at render
 * time, so they sit between the agent's own chunks in `entries` while
 * appearing nowhere between them on screen. The agent's sentence must survive
 * that (RFC 0057; Dave's screenshot, 2026-10-08 — one sentence split into two
 * bubbles with a blank gap where the worker's rows had been).
 */
describe("a worker's rows do not split the agent's sentence", () => {
  const WORKER = "a26fef4c40ae0ac1d";
  const DISPATCH = "toolu_dispatch";

  const capDispatch = tool("tool_call_update", {
    toolCallId: DISPATCH,
    title: "Get one-sentence summaries",
    subagent: true,
    handedOff: true,
    subagentId: WORKER,
  });

  const childCall = (id: string, title: string) =>
    tool("tool_call", {
      toolCallId: id,
      title,
      status: "completed",
      parentToolCallId: DISPATCH,
    });

  const childChunk = (text: string) =>
    ({
      kind: "agent_message_chunk",
      text,
      messageId: "child-msg",
      subagentId: WORKER,
      raw: {},
    }) as AgentSessionUpdate;

  it("keeps one sentence in one bubble across a worker's tool calls", () => {
    const t = fold([
      capDispatch,
      chunk("agent_message_chunk", "Agent is running. I'll get you the", "m1"),
      childCall("c1", "Read skills-manager/README.md"),
      childCall("c2", "Read tasks/README.md"),
      chunk("agent_message_chunk", " summaries when it completes.", "m1"),
    ]);
    const messages = t.entries.filter((e) => e.type === "message");
    expect(messages).toHaveLength(1);
    expect((messages[0] as MessageEntry).text).toBe(
      "Agent is running. I'll get you the summaries when it completes.",
    );
  });

  it("keeps one sentence in one bubble across a worker's own prose", () => {
    const t = fold([
      capDispatch,
      chunk("agent_message_chunk", "Dispatched. ", "m1"),
      childChunk("Working on it."),
      chunk("agent_message_chunk", "Results shortly.", "m1"),
    ]);
    const own = t.entries.filter(
      (e) => e.type === "message" && e.subagentId === undefined,
    );
    expect(own).toHaveLength(1);
    expect((own[0] as MessageEntry).text).toBe("Dispatched. Results shortly.");
  });

  it("still ends the run at a tool call the agent made itself", () => {
    // The distinction that matters: the agent's own call stays in the flow and
    // genuinely sits between the two paragraphs on screen.
    const t = fold([
      chunk("agent_message_chunk", "before", "m1"),
      tool("tool_call", { toolCallId: "own", title: "Read notes.md" }),
      chunk("agent_message_chunk", "after", "m1"),
    ]);
    expect(t.entries.map((e) => e.type)).toEqual([
      "message",
      "tool",
      "message",
    ]);
  });

  it("still ends the run at a dispatch row, which stays in the flow", () => {
    // The dispatch heads its block rather than being relocated into one, so it
    // breaks a run exactly as any other tool call does.
    const t = fold([
      chunk("agent_message_chunk", "I'll delegate this.", "m1"),
      capDispatch,
      chunk("agent_message_chunk", "Dispatched.", "m1"),
    ]);
    expect(t.entries.filter((e) => e.type === "message")).toHaveLength(2);
  });

  it("does not merge into a run the agent already closed", () => {
    // A reused id after a real break must start a new bubble, not reach back
    // past the tool call and reopen a paragraph the reader has scrolled by.
    const t = fold([
      chunk("agent_message_chunk", "before", "m1"),
      tool("tool_call", { toolCallId: "own", title: "Read notes.md" }),
      chunk("agent_message_chunk", "after", "m1"),
      chunk("agent_message_chunk", " and more", "m1"),
    ]);
    const messages = t.entries.filter(
      (e) => e.type === "message",
    ) as MessageEntry[];
    expect(messages.map((m) => m.text)).toEqual(["before", "after and more"]);
  });

  it("applies the same column rule inside the worker's own block", () => {
    // A worker's call *does* sit between its two prose chunks — inside the
    // block, on screen. So it breaks the run, exactly as the agent's own call
    // breaks the agent's. The rule is about the column, not about who is
    // speaking.
    const t = fold([
      capDispatch,
      childChunk("Command "),
      childCall("c1", "sleep 30"),
      childChunk("running."),
    ]);
    const childMessages = t.entries.filter(
      (e) => e.type === "message" && e.subagentId === WORKER,
    ) as MessageEntry[];
    expect(childMessages.map((m) => m.text)).toEqual(["Command ", "running."]);
  });

  it("keeps a worker's consecutive prose in one bubble", () => {
    const t = fold([
      capDispatch,
      childChunk("Command "),
      childChunk("running."),
    ]);
    const childMessages = t.entries.filter(
      (e) => e.type === "message" && e.subagentId === WORKER,
    ) as MessageEntry[];
    expect(childMessages.map((m) => m.text)).toEqual(["Command running."]);
  });

  it("renders the agent's sentence as one bubble outside the block", () => {
    // End to end through the render projection, which is where the gap showed.
    const entries = fold([
      capDispatch,
      chunk("agent_message_chunk", "Agent is running. I'll get you the", "m1"),
      childCall("c1", "Read tasks/README.md"),
      chunk("agent_message_chunk", " summaries when it completes.", "m1"),
    ]).entries;
    const out = groupDelegatedCalls(entries);
    expect(out).toHaveLength(2);
    expect(out[0]!.type).toBe("delegated-group");
    expect((out[1] as MessageEntry).text).toBe(
      "Agent is running. I'll get you the summaries when it completes.",
    );
  });
});

describe("delegatedSummaryLabel", () => {
  const call = (id: string): ToolEntry =>
    ({
      type: "tool",
      key: id,
      toolCallId: id,
      title: "Read x",
      status: "completed",
      lines: [],
    }) as ToolEntry;
  const prose = (key: string): MessageEntry =>
    ({ type: "message", key, role: "agent", text: "done" }) as MessageEntry;

  it("counts the worker's tool calls", () => {
    expect(delegatedSummaryLabel([call("a"), call("b"), call("c")])).toBe(
      "3 tool calls · expand to see agent output",
    );
  });

  it("pluralises", () => {
    expect(delegatedSummaryLabel([call("a")])).toBe(
      "1 tool call · expand to see agent output",
    );
  });

  it("does not count the worker's prose as a call", () => {
    // "3 messages" would mean nothing to a reader; the prose is what "agent
    // output" already refers to.
    expect(delegatedSummaryLabel([call("a"), prose("m1"), prose("m2")])).toBe(
      "1 tool call · expand to see agent output",
    );
  });

  it("still offers the output when the worker made no calls at all", () => {
    // A worker that only answered. A bare "0 tool calls" would read as though
    // it did nothing, when its whole answer is in there.
    expect(delegatedSummaryLabel([prose("m1")])).toBe(
      "expand to see agent output",
    );
    expect(delegatedSummaryLabel([])).toBe("expand to see agent output");
  });
});

/**
 * A folded run collapses completely once its calls have settled — the same
 * treatment a finished dispatch block gets (Dave, 2026-10-08).
 */
describe("toolGroupSettled", () => {
  const at = (status: string): ToolEntry =>
    ({
      type: "tool",
      key: `k${status}`,
      toolCallId: `c${status}`,
      title: "Read x",
      status,
      lines: [],
    }) as ToolEntry;

  it("is settled when every call has finished", () => {
    expect(toolGroupSettled([at("completed"), at("failed")])).toBe(true);
  });

  it.each(["pending", "in_progress"])(
    "is not settled while one call is %s",
    (status) => {
      // The tail of a live run is exactly what a reader watches, so it stays
      // open even though the rest of the run is done.
      expect(toolGroupSettled([at("completed"), at(status)])).toBe(false);
    },
  );

  it("treats a vendor's own status as settled", () => {
    // Same tolerance `isToolRunning` applies: only the two running statuses
    // are running, and an unknown one is not a reason to stay open forever.
    expect(toolGroupSettled([at("cancelled")])).toBe(true);
  });

  it("agrees with isToolRunning, which is the single owner of the question", () => {
    const live = at("in_progress");
    expect(toolGroupSettled([live])).toBe(!isToolRunning(live));
  });
});

describe("toolGroupSummaryLabel", () => {
  const at = (key: string, status: string): ToolEntry =>
    ({
      type: "tool",
      key,
      toolCallId: key,
      title: "Read x",
      status,
      lines: [],
    }) as ToolEntry;

  it("gives the total the header's breakdown makes you add up", () => {
    const tools = Array.from({ length: 9 }, (_, i) => at(`c${i}`, "completed"));
    expect(toolGroupSummaryLabel(tools)).toBe("expand to see all 9");
  });

  it("says nothing about failures, because a group cannot contain one", () => {
    // Not a gap in the summary: `foldToolRuns` breaks the run at a failed
    // call, so the failed row renders in full outside the group. The test
    // below pins that, which is what makes this silence correct rather than
    // an omission.
    const t = fold([
      ...readCalls(TOOL_GROUP_THRESHOLD),
      tool("tool_call", {
        toolCallId: "boom",
        title: "Shell",
        status: "pending",
      }),
      tool("tool_call_update", { toolCallId: "boom", status: "failed" }),
      ...readCalls(TOOL_GROUP_THRESHOLD),
    ]);
    const folded = foldToolRuns(t.entries);
    const groups = folded.filter((e) => e.type === "tool-group");
    // Two groups either side, and the failure standing on its own between them.
    expect(groups).toHaveLength(2);
    for (const g of groups as ToolGroupEntry[]) {
      expect(g.tools.some((c) => c.status === "failed")).toBe(false);
      expect(toolGroupSummaryLabel(g.tools)).not.toContain("failed");
    }
    const loose = folded.filter(
      (e) => e.type === "tool" && e.status === "failed",
    );
    expect(loose).toHaveLength(1);
  });
});

/**
 * A folded run must not collapse until nothing more can join it (Dave,
 * 2026-10-08). Keyed on "every call settled" alone, the block collapsed the
 * moment the agent paused, re-opened when its next call landed in the same
 * run, and collapsed again — flickering its way through a turn.
 */
describe("toolGroupCollapsed — the one-way signal", () => {
  const groupsOf = (t: Transcript) =>
    foldToolRuns(t.entries).filter(
      (e) => e.type === "tool-group",
    ) as ToolGroupEntry[];

  it("stays open while the run is still the last thing in the turn", () => {
    // Every call has settled, but the agent has not spoken — its next call
    // joins this very run, so collapsing now is what flickers.
    const t = fold(readCalls(TOOL_GROUP_THRESHOLD));
    const [group] = groupsOf(t);
    expect(group).toBeDefined();
    expect(toolGroupSettled(group!.tools)).toBe(true);
    expect(group!.closed).toBe(false);
    expect(toolGroupCollapsed(group!)).toBe(false);
  });

  it("does not reopen when the agent's next call extends the run", () => {
    // The flicker, reproduced as a sequence: settled, grown, settled again.
    // The group is open throughout rather than collapsing in between.
    const first = fold(readCalls(TOOL_GROUP_THRESHOLD));
    expect(toolGroupCollapsed(groupsOf(first)[0]!)).toBe(false);
    const grown = fold(readCalls(2), first);
    const [group] = groupsOf(grown);
    expect(group!.tools).toHaveLength(TOOL_GROUP_THRESHOLD + 2);
    expect(toolGroupCollapsed(group!)).toBe(false);
  });

  it("collapses once the agent responds, which ends the run", () => {
    const t = fold([
      ...readCalls(TOOL_GROUP_THRESHOLD),
      chunk("agent_message_chunk", "Done — here is what I found.", "m1"),
    ]);
    const [group] = groupsOf(t);
    expect(group!.closed).toBe(true);
    expect(toolGroupCollapsed(group!)).toBe(true);
  });

  it("stays closed as the turn goes on", () => {
    // One-way: the entry that closed the run never goes away, so later calls
    // start a *new* run rather than reopening this one.
    const t = fold([
      ...readCalls(TOOL_GROUP_THRESHOLD),
      chunk("agent_message_chunk", "Checking a few more things.", "m1"),
      ...readCalls(TOOL_GROUP_THRESHOLD),
    ]);
    const groups = groupsOf(t);
    expect(groups).toHaveLength(2);
    expect(toolGroupCollapsed(groups[0]!)).toBe(true);
    // ...and the new trailing run is open, for the same reason the first was.
    expect(toolGroupCollapsed(groups[1]!)).toBe(false);
  });

  it("does not collapse a closed run that still has a call in flight", () => {
    // `applyUpdate` patches a row in place wherever it sits, so a closed run
    // can still hold a live call. Collapsing over a spinner hides the one
    // thing worth watching.
    const t = fold([
      ...readCalls(TOOL_GROUP_THRESHOLD - 1),
      tool("tool_call", {
        toolCallId: "slow",
        title: "Read big.txt",
        kind: "read",
        status: "in_progress",
      }),
      chunk("agent_message_chunk", "Meanwhile…", "m1"),
    ]);
    const [group] = groupsOf(t);
    expect(group!.closed).toBe(true);
    expect(toolGroupSettled(group!.tools)).toBe(false);
    expect(toolGroupCollapsed(group!)).toBe(false);
  });
});
