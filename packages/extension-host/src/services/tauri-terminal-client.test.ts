import { describe, it, expect, vi, beforeEach } from "vitest";

const { invokeMock, listenMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(() => Promise.resolve()),
  listenMock: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }));

import {
  parseOscSequences,
  TauriTerminalClient,
} from "./tauri-terminal-client";
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

// On Unix the reader thread starts in `terminal_create`, so a missing
// `terminal_start_stream` is invisible. On Windows the reader is deferred
// until that command, so any subscription that skips it silently receives
// nothing — which is how agent detection (OSC-only on Windows, since
// `subscribe_foreground` returns None there) stopped working for every agent
// in an unmounted terminal.
describe("output stream startup", () => {
  beforeEach(() => {
    invokeMock.mockClear();
    listenMock.mockClear();
  });

  const startCalls = (sessionId: string) =>
    invokeMock.mock.calls.filter(
      ([cmd, args]) =>
        cmd === "terminal_start_stream" &&
        (args as { sessionId: string }).sessionId === sessionId,
    ).length;

  it("starts the reader when the first OSC listener subscribes", () => {
    const client = new TauriTerminalClient();
    client.onOsc("s1", () => {});
    expect(startCalls("s1")).toBe(1);
  });

  it("starts the reader when the first output listener subscribes", () => {
    const client = new TauriTerminalClient();
    client.onOutput("s2", () => {});
    expect(startCalls("s2")).toBe(1);
  });

  it("does not re-invoke for each additional listener of the same kind", () => {
    const client = new TauriTerminalClient();
    client.onOsc("s3", () => {});
    client.onOsc("s3", () => {});
    client.onOsc("s3", () => {});
    expect(startCalls("s3")).toBe(1);
  });

  it("invokes at most once per subscription kind", () => {
    const client = new TauriTerminalClient();
    client.onOsc("s6", () => {});
    client.onOutput("s6", () => {});
    // OSC and output track separate listener sets, so a terminal that has both
    // invokes twice. Bounded at two and idempotent on the Rust side
    // (`AtomicBool` swap), so this is deliberately not deduplicated — a
    // per-session guard would need clearing in `cleanup` to stay correct
    // across a session teardown, which is more machinery than two cheap
    // invokes are worth.
    expect(startCalls("s6")).toBe(2);
  });

  it("starts the reader for an exit-only subscriber", () => {
    // Exit rides the same reader loop as output. An extension that spawns a
    // session it never renders and just waits for it to finish would otherwise
    // wait forever on Windows.
    const client = new TauriTerminalClient();
    client.onExit("s7", () => {});
    expect(startCalls("s7")).toBe(1);
  });

  it("starts each session's reader independently", () => {
    const client = new TauriTerminalClient();
    client.onOsc("s4", () => {});
    client.onOsc("s5", () => {});
    expect(startCalls("s4")).toBe(1);
    expect(startCalls("s5")).toBe(1);
  });
});
