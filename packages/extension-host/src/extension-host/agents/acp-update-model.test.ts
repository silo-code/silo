import { describe, it, expect } from "vitest";
import {
  parseCommands,
  parseContentBlock,
  parsePlanEntries,
  parseToolCall,
  parseUsage,
} from "./acp-update-model";

describe("parseToolCall", () => {
  // The exact frame Cursor 2026.09.02 opens a call with.
  it("reads a tool_call the way Cursor sends one", () => {
    expect(
      parseToolCall({
        sessionUpdate: "tool_call",
        toolCallId: "call-1",
        title: "Read File",
        kind: "read",
        status: "pending",
        rawInput: {},
      }),
    ).toEqual({
      toolCallId: "call-1",
      title: "Read File",
      kind: "read",
      status: "pending",
      rawInput: {},
    });
  });

  // The most common frame on the wire: an update that changed one thing.
  it("omits every field an update did not carry, so absent stays absent", () => {
    const call = parseToolCall({
      sessionUpdate: "tool_call_update",
      toolCallId: "call-1",
      status: "in_progress",
    });
    expect(call).toEqual({ toolCallId: "call-1", status: "in_progress" });
    expect("title" in call!).toBe(false);
    expect("content" in call!).toBe(false);
  });

  it("keeps a call with no id out of the stream — nothing can patch by it", () => {
    expect(parseToolCall({ title: "orphan" })).toBeUndefined();
    expect(parseToolCall({ toolCallId: 7 })).toBeUndefined();
    expect(parseToolCall(undefined)).toBeUndefined();
    expect(parseToolCall("nope")).toBeUndefined();
  });

  it("reads locations, with and without the line an agent may omit", () => {
    expect(
      parseToolCall({
        toolCallId: "c",
        locations: [
          { path: "/a.ts" },
          { path: "/b.ts", line: 12 },
          { line: 3 },
          "junk",
        ],
      })?.locations,
    ).toEqual([{ path: "/a.ts" }, { path: "/b.ts", line: 12 }]);
  });

  it("reads a diff block, collapsing the null oldText of a file being created", () => {
    const content = parseToolCall({
      toolCallId: "c",
      content: [
        { type: "diff", path: "/new.md", oldText: null, newText: "hello\n" },
      ],
    })?.content;
    expect(content).toEqual([
      { type: "diff", path: "/new.md", newText: "hello\n" },
    ]);
  });

  it("reads a text content block", () => {
    expect(
      parseToolCall({
        toolCallId: "c",
        content: [{ type: "content", content: { type: "text", text: "ok" } }],
      })?.content,
    ).toEqual([{ type: "content", content: { type: "text", text: "ok" } }]);
  });

  it("keeps a block type it has never seen rather than dropping it", () => {
    expect(
      parseToolCall({
        toolCallId: "c",
        content: [{ type: "terminal", terminalId: "t1" }, { type: "_vendor" }],
      })?.content,
    ).toEqual([{ type: "terminal", terminalId: "t1" }, { type: "_vendor" }]);
  });

  it("drops a content entry with no type, and one that is not an object", () => {
    expect(
      parseToolCall({ toolCallId: "c", content: [{ text: "x" }, 5] })?.content,
    ).toEqual([]);
  });

  it("distinguishes an empty content array from an absent one", () => {
    expect("content" in parseToolCall({ toolCallId: "c", content: [] })!).toBe(
      true,
    );
    expect("content" in parseToolCall({ toolCallId: "c" })!).toBe(false);
  });

  it("passes rawInput and rawOutput through untouched, whatever shape they are", () => {
    expect(
      parseToolCall({
        toolCallId: "c",
        rawInput: { command: "ls -1" },
        rawOutput: ["a", "b"],
      }),
    ).toMatchObject({
      rawInput: { command: "ls -1" },
      rawOutput: ["a", "b"],
    });
  });

  it("survives fields of the wrong type instead of throwing", () => {
    expect(
      parseToolCall({
        toolCallId: "c",
        title: null,
        kind: 3,
        status: {},
        content: "nope",
        locations: "nope",
      }),
    ).toEqual({ toolCallId: "c" });
  });

  // RFC 0055. The facts themselves are `chat-delegated-work.test.ts`'s
  // business; what matters here is that they reach the modelled surface at
  // all, and that absence still means absence.
  it("surfaces the delegated-work facts on the modelled call", () => {
    expect(
      parseToolCall({
        _meta: { claudeCode: { toolName: "Agent", subagent: true } },
        toolCallId: "toolu_017w2qK7W5kVxwtS8365ecQW",
        sessionUpdate: "tool_call",
        status: "pending",
        title: "Task",
        kind: "think",
      }),
    ).toEqual({
      toolCallId: "toolu_017w2qK7W5kVxwtS8365ecQW",
      status: "pending",
      title: "Task",
      kind: "think",
      subagent: true,
    });
  });

  it("surfaces a hand-off that arrived with no status of its own", () => {
    expect(
      parseToolCall({
        _meta: {
          claudeCode: {
            toolResponse: { isAsync: true, status: "async_launched" },
            toolName: "Agent",
          },
        },
        toolCallId: "toolu_017w2qK7W5kVxwtS8365ecQW",
        sessionUpdate: "tool_call_update",
      }),
    ).toEqual({
      toolCallId: "toolu_017w2qK7W5kVxwtS8365ecQW",
      handedOff: true,
    });
  });

  it("surfaces a delegated call's pointer at its dispatch", () => {
    expect(
      parseToolCall({
        _meta: {
          claudeCode: {
            toolName: "Bash",
            parentToolUseId: "toolu_017w2qK7W5kVxwtS8365ecQW",
          },
        },
        toolCallId: "toolu_01VwTaeFYn8sVEYQPATUootm",
        title: "sleep 35",
      })?.parentToolCallId,
    ).toBe("toolu_017w2qK7W5kVxwtS8365ecQW");
  });

  it("omits each delegated-work field the wire did not carry", () => {
    const call = parseToolCall({
      toolCallId: "c",
      status: "completed",
      _meta: { claudeCode: { toolName: "Read" } },
    })!;
    expect(call).toEqual({ toolCallId: "c", status: "completed" });
    expect("subagent" in call).toBe(false);
    expect("handedOff" in call).toBe(false);
    expect("parentToolCallId" in call).toBe(false);
  });
});

describe("parsePlanEntries", () => {
  // The frame @zed-industries/claude-code-acp 0.16.2 sends for a todo list.
  it("reads the plan an agent reissues in full", () => {
    expect(
      parsePlanEntries([
        { content: "Read notes.md", status: "pending", priority: "medium" },
        { content: "Run ls -1", status: "completed", priority: "medium" },
      ]),
    ).toEqual([
      { content: "Read notes.md", status: "pending", priority: "medium" },
      { content: "Run ls -1", status: "completed", priority: "medium" },
    ]);
  });

  it("drops an entry with nothing to show", () => {
    expect(
      parsePlanEntries([{ status: "pending" }, { content: "" }, "junk"]),
    ).toEqual([]);
  });

  it("leaves status and priority off when the agent ranked nothing", () => {
    expect(parsePlanEntries([{ content: "step" }])).toEqual([
      { content: "step" },
    ]);
  });

  it("tells an emptied plan apart from no plan at all", () => {
    expect(parsePlanEntries([])).toEqual([]);
    expect(parsePlanEntries(undefined)).toBeUndefined();
    expect(parsePlanEntries({ entries: [] })).toBeUndefined();
  });
});

describe("parseContentBlock", () => {
  it("reads the text block every agent sends", () => {
    expect(parseContentBlock({ type: "text", text: "hi" })).toEqual({
      type: "text",
      text: "hi",
    });
  });

  it("carries the fields a non-text block identifies itself by", () => {
    expect(
      parseContentBlock({
        type: "resource_link",
        uri: "file:///a.ts",
        name: "a.ts",
        mimeType: "text/plain",
      }),
    ).toEqual({
      type: "resource_link",
      uri: "file:///a.ts",
      name: "a.ts",
      mimeType: "text/plain",
    });
  });

  it("keeps a vendor block type — a consumer can name what it cannot render", () => {
    expect(parseContentBlock({ type: "_vendor/thing" })).toEqual({
      type: "_vendor/thing",
    });
  });

  it("returns nothing without a type to switch on", () => {
    expect(parseContentBlock({ text: "orphan" })).toBeUndefined();
    expect(parseContentBlock(null)).toBeUndefined();
  });
});

// RFC 0040 — commands (and, unmarked or `skill:`-prefixed, skills) advertised
// over `available_commands_update`.
describe("parseCommands", () => {
  it("reads a command with a hinted argument", () => {
    expect(
      parseCommands([
        {
          name: "compact",
          description: "Manually compact the session context",
          input: { hint: "optional custom instructions" },
        },
      ]),
    ).toEqual([
      {
        name: "compact",
        description: "Manually compact the session context",
        input: { hint: "optional custom instructions" },
      },
    ]);
  });

  it("keeps a skill in the same list, prefix and all — never split out", () => {
    expect(
      parseCommands([{ name: "skill:code-review", description: "Review…" }]),
    ).toEqual([{ name: "skill:code-review", description: "Review…" }]);
  });

  // Claude sends `input: null`; pi omits the key. Both must normalise to the
  // same thing so a consumer never has to check for two spellings of "none".
  it("normalises input: null and an omitted input to the same absence", () => {
    const [withNull] = parseCommands([{ name: "compact", input: null }]);
    const [omitted] = parseCommands([{ name: "compact" }]);
    expect(withNull).toEqual({ name: "compact" });
    expect(omitted).toEqual({ name: "compact" });
    expect("input" in withNull).toBe(false);
    expect("input" in omitted).toBe(false);
  });

  it("keeps input present-but-empty when the agent gave no hint", () => {
    const [cmd] = parseCommands([{ name: "compact", input: {} }]);
    expect(cmd.input).toEqual({});
  });

  it("drops an entry with no usable name", () => {
    expect(parseCommands([{ description: "orphan" }])).toEqual([]);
  });

  it("returns nothing for a non-array payload", () => {
    expect(parseCommands(undefined)).toEqual([]);
    expect(parseCommands(null)).toEqual([]);
  });
});

describe("parseUsage", () => {
  it("reads used and size", () => {
    expect(parseUsage({ used: 1536, size: 8192 })).toEqual({
      used: 1536,
      size: 8192,
    });
  });

  it("reads an attached cost", () => {
    expect(
      parseUsage({
        used: 1536,
        size: 8192,
        cost: { amount: 0.42, currency: "USD" },
      }),
    ).toEqual({
      used: 1536,
      size: 8192,
      cost: { amount: 0.42, currency: "USD" },
    });
  });

  it("drops a cost missing either field, keeping used/size", () => {
    expect(parseUsage({ used: 1, size: 2, cost: { amount: 0.1 } })).toEqual({
      used: 1,
      size: 2,
    });
  });

  // Most agents never send `usage_update` at all — "not reported" must not
  // look like an error.
  it("returns undefined when used or size is missing or non-numeric", () => {
    expect(parseUsage({ size: 8192 })).toBeUndefined();
    expect(parseUsage({ used: 1536 })).toBeUndefined();
    expect(parseUsage({ used: "a lot", size: 8192 })).toBeUndefined();
    expect(parseUsage(undefined)).toBeUndefined();
    expect(parseUsage(null)).toBeUndefined();
  });
});
