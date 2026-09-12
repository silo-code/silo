import { describe, it, expect } from "vitest";
import {
  parseContentBlock,
  parsePlanEntries,
  parseToolCall,
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
