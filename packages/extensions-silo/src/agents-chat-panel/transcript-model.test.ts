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
  elapsedLabel,
  emptyTranscript,
  foldToolRuns,
  formatToolInput,
  groupTurns,
  nextEntryKey,
  sameTurn,
  planRows,
  seedFromJournal,
  stopReasonNotice,
  toolContentLines,
  toolGroupLabel,
  toolOutputIsMarkdown,
  toolStatusTone,
  userPromptHistory,
  workedForLabel,
  TOOL_GROUP_THRESHOLD,
  type MessageEntry,
  type PlanEntry,
  type ToolEntry,
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
    expect(group.hasError).toBe(false);
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

  it("marks a group hasError when any call inside it failed", () => {
    const t = fold([
      ...readCalls(TOOL_GROUP_THRESHOLD - 1),
      ...readCalls(1, { status: "failed" }),
    ]);
    const folded = foldToolRuns(t.entries);
    const group = folded[0] as ToolGroupEntry;
    expect(group.hasError).toBe(true);
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
