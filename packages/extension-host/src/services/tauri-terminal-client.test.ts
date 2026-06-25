import { describe, it, expect } from "vitest";
import { parseOscSequences } from "./tauri-terminal-client";
import type { OscEvent } from "@silo-code/sdk";

function collect(chunk: string): OscEvent[] {
  const events: OscEvent[] = [];
  parseOscSequences(chunk, (e) => events.push(e));
  return events;
}

describe("parseOscSequences", () => {
  it("parses a BEL-terminated OSC 0 title sequence", () => {
    const events = collect("\x1b]0;My Title\x07");
    expect(events).toEqual([{ code: 0, payload: "My Title" }]);
  });

  it("parses an ST-terminated OSC 0 title sequence", () => {
    const events = collect("\x1b]0;My Title\x1b\\");
    expect(events).toEqual([{ code: 0, payload: "My Title" }]);
  });

  it("parses a braille spinner (Claude Code busy state)", () => {
    const spinner = "\u2804 Working…"; // braille char as first character
    const events = collect(`\x1b]0;${spinner}\x07`);
    expect(events).toHaveLength(1);
    const first = events[0].payload.charCodeAt(0);
    expect(first).toBeGreaterThanOrEqual(0x2800);
    expect(first).toBeLessThanOrEqual(0x28ff);
  });

  it("parses the idle ✳ character (Claude Code idle state)", () => {
    const events = collect("\x1b]0;\u2733 Ready\x07");
    expect(events).toHaveLength(1);
    expect(events[0].payload.startsWith("\u2733")).toBe(true);
  });

  it("parses OSC 7 working directory", () => {
    const events = collect("\x1b]7;file:///home/user/project\x07");
    expect(events).toEqual([{ code: 7, payload: "file:///home/user/project" }]);
  });

  it("parses OSC 9 iTerm2 notification", () => {
    const events = collect("\x1b]9;Needs attention\x07");
    expect(events).toEqual([{ code: 9, payload: "Needs attention" }]);
  });

  it("parses multiple OSC sequences in one chunk", () => {
    const chunk =
      "\x1b]0;title one\x07some output\x1b]0;title two\x07more output";
    const events = collect(chunk);
    expect(events).toEqual([
      { code: 0, payload: "title one" },
      { code: 0, payload: "title two" },
    ]);
  });

  it("returns no events for plain output with no OSC sequences", () => {
    expect(collect("Hello, world!\r\n")).toEqual([]);
  });

  it("returns no events for an unterminated OSC sequence", () => {
    // Missing BEL or ST at end — should not fire
    expect(collect("\x1b]0;incomplete")).toEqual([]);
  });

  it("ignores OSC sequences embedded in larger output chunks", () => {
    const chunk = "$ ls\r\n\x1b]0;bash\x07\r\nfoo  bar\r\n";
    const events = collect(chunk);
    expect(events).toEqual([{ code: 0, payload: "bash" }]);
  });
});
