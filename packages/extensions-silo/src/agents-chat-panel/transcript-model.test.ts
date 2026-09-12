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
  elapsedLabel,
  emptyTranscript,
  formatToolInput,
  groupTurns,
  nextEntryKey,
  planRows,
  seedFromJournal,
  stopReasonNotice,
  toolContentLines,
  toolOutputIsMarkdown,
  toolStatusTone,
  workedForLabel,
  type MessageEntry,
  type PlanEntry,
  type ToolEntry,
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
