import { describe, it, expect } from "vitest";
import type { AgentSessionUpdate } from "@silo-code/sdk";
import {
  appendNotice,
  appendUserMessage,
  applyUpdate,
  emptyTranscript,
  planRows,
  stopReasonNotice,
  toolContentLines,
  toolStatusTone,
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

function raw(
  kind: string,
  fields: Record<string, unknown>,
): AgentSessionUpdate {
  return { kind, raw: { sessionUpdate: kind, ...fields } };
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
      raw("tool_call", { toolCallId: "c1", title: "Read file" }),
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
      raw("tool_call", {
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

  it("patches the existing row in place on tool_call_update", () => {
    const t = fold([
      raw("tool_call", {
        toolCallId: "c1",
        title: "Run tests",
        status: "pending",
      }),
      raw("tool_call_update", { toolCallId: "c1", status: "completed" }),
    ]);
    expect(t.entries).toHaveLength(1);
    expect(t.entries[0]).toMatchObject({
      status: "completed",
      title: "Run tests",
    });
  });

  it("does not blank existing content when an update carries none", () => {
    const t = fold([
      raw("tool_call", {
        toolCallId: "c1",
        title: "Run tests",
        content: [{ type: "content", content: { type: "text", text: "ok" } }],
      }),
      raw("tool_call_update", { toolCallId: "c1", status: "completed" }),
    ]);
    expect((t.entries[0] as ToolEntry).lines).toEqual(["ok"]);
  });

  it("creates a row for an update whose tool_call never arrived", () => {
    const t = fold([
      raw("tool_call_update", { toolCallId: "orphan", status: "failed" }),
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
      raw("tool_call", { toolCallId: "c1", title: "A" }),
      raw("tool_call", { toolCallId: "c2", title: "B" }),
      raw("tool_call_update", { toolCallId: "c1", status: "completed" }),
    ]);
    expect(t.entries).toHaveLength(2);
    expect((t.entries[0] as ToolEntry).status).toBe("completed");
    expect((t.entries[1] as ToolEntry).status).toBe("pending");
  });
});

describe("applyUpdate — plan", () => {
  it("renders the plan rows", () => {
    const t = fold([
      raw("plan", {
        entries: [
          { content: "Read the code", status: "completed", priority: "high" },
          { content: "Write the fix", status: "in_progress" },
        ],
      }),
    ]);
    expect(t.entries).toHaveLength(1);
    expect((t.entries[0] as PlanEntry).rows).toEqual([
      { content: "Read the code", status: "completed", priority: "high" },
      { content: "Write the fix", status: "in_progress" },
    ]);
  });

  it("replaces the plan in place — the agent reissues it in full", () => {
    const t = fold([
      raw("plan", { entries: [{ content: "one", status: "pending" }] }),
      chunk("agent_message_chunk", "working", "m1"),
      raw("plan", { entries: [{ content: "one", status: "completed" }] }),
    ]);
    expect(t.entries.filter((e) => e.type === "plan")).toHaveLength(1);
    expect((t.entries[0] as PlanEntry).rows[0]!.status).toBe("completed");
  });

  it("ignores a first plan with no usable rows", () => {
    const t = applyUpdate(emptyTranscript, raw("plan", { entries: [] }));
    expect(t).toBe(emptyTranscript);
  });
});

describe("applyUpdate — tolerance", () => {
  it("returns the same transcript for a kind it does not render", () => {
    const t = fold([chunk("agent_message_chunk", "hi", "m1")]);
    const after = applyUpdate(t, raw("available_commands_update", {}));
    expect(after).toBe(t);
  });

  it("does not throw on a vendor kind nobody has seen before", () => {
    expect(() =>
      applyUpdate(emptyTranscript, raw("_vendor/something_new", { x: 1 })),
    ).not.toThrow();
  });

  it("survives a tool_call whose fields are all the wrong type", () => {
    const t = applyUpdate(
      emptyTranscript,
      raw("tool_call", { toolCallId: 7, title: null, content: "nope" }),
    );
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

describe("toolContentLines", () => {
  it("returns nothing for a missing or non-array content", () => {
    expect(toolContentLines(undefined)).toEqual([]);
    expect(toolContentLines("text")).toEqual([]);
  });

  it("names a diff by its path", () => {
    expect(toolContentLines([{ type: "diff", path: "src/a.ts" }])).toEqual([
      "diff src/a.ts",
    ]);
  });

  it("names a block it cannot expand rather than dropping it", () => {
    expect(
      toolContentLines([
        { type: "content", content: { type: "image", data: "…" } },
        { type: "terminal", terminalId: "t1" },
      ]),
    ).toEqual(["[image]", "[terminal]"]);
  });
});

describe("planRows", () => {
  it("drops entries with no content", () => {
    expect(
      planRows({ entries: [{ status: "pending" }, { content: "real" }] }),
    ).toEqual([{ content: "real", status: "pending" }]);
  });

  it("returns nothing when entries is absent", () => {
    expect(planRows({})).toEqual([]);
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
