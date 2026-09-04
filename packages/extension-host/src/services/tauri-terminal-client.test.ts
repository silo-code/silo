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

// RFC 0036 / issue #500. Re-attaching to a session makes the host replay up to
// 256KB of its ring, byte-for-byte indistinguishable from live output. Every
// subscriber used to read that as things happening right now — the terminal
// repainted scrollback it had already restored, and agent status flipped for
// turns that finished before the app started. Replay now travels tagged, and
// each subscription says whether it wants it.
describe("replay fan-out", () => {
  beforeEach(() => {
    invokeMock.mockClear();
    listenMock.mockClear();
  });

  /**
   * Grab the handler the client registered for a session's output events, so a
   * test can push frames at it the way the Rust side would.
   */
  async function outputBridge(sessionId: string) {
    // setupSessionListeners is fired without await from beginOutputStream.
    await Promise.resolve();
    await Promise.resolve();
    const call = listenMock.mock.calls.find(
      ([event]) => event === `terminal_output:${sessionId}`,
    );
    if (!call) throw new Error(`no output bridge for ${sessionId}`);
    const handler = call[1] as (e: {
      payload: { data: string; replay: boolean };
    }) => void;
    return (data: string, replay: boolean) =>
      handler({ payload: { data, replay } });
  }

  it("withholds replayed output from a default subscriber", async () => {
    const client = new TauriTerminalClient();
    const seen: string[] = [];
    client.onOutput("r1", (data) => seen.push(data));
    const emit = await outputBridge("r1");

    emit("old scrollback", true);
    emit("live output", false);

    expect(seen).toEqual(["live output"]);
  });

  it("delivers replayed output to a subscriber that opted in, flagged", async () => {
    const client = new TauriTerminalClient();
    const seen: Array<[string, boolean]> = [];
    client.onOutput("r2", (data, { replay }) => seen.push([data, replay]), {
      includeReplay: true,
    });
    const emit = await outputBridge("r2");

    emit("old scrollback", true);
    emit("live output", false);

    expect(seen).toEqual([
      ["old scrollback", true],
      ["live output", false],
    ]);
  });

  it("gives two subscribers on one session what each asked for", async () => {
    // The real shape: the terminal panel wants the scrollback to paint, while
    // a status watcher on the same session must not see it.
    const client = new TauriTerminalClient();
    const painter: string[] = [];
    const watcher: string[] = [];
    client.onOutput("r3", (d) => painter.push(d), { includeReplay: true });
    client.onOutput("r3", (d) => watcher.push(d));
    const emit = await outputBridge("r3");

    emit("history", true);
    emit("now", false);

    expect(painter).toEqual(["history", "now"]);
    expect(watcher).toEqual(["now"]);
  });

  it("applies the same rule to OSC sequences", async () => {
    // A replayed "busy" title describes a turn that is already over.
    const client = new TauriTerminalClient();
    const optedOut: OscEvent[] = [];
    const optedIn: Array<[OscEvent, boolean]> = [];
    client.onOsc("r4", (e) => optedOut.push(e));
    client.onOsc("r4", (e, { replay }) => optedIn.push([e, replay]), {
      includeReplay: true,
    });
    const emit = await outputBridge("r4");

    emit("\x1b]0;✳ done\x07", true);
    emit("\x1b]0;live\x07", false);

    expect(optedOut).toEqual([{ code: 0, payload: "live" }]);
    expect(optedIn).toEqual([
      [{ code: 0, payload: "✳ done" }, true],
      [{ code: 0, payload: "live" }, false],
    ]);
  });

  it("unsubscribing removes only that subscription", async () => {
    const client = new TauriTerminalClient();
    const a: string[] = [];
    const b: string[] = [];
    const offA = client.onOutput("r5", (d) => a.push(d));
    client.onOutput("r5", (d) => b.push(d));
    const emit = await outputBridge("r5");

    emit("first", false);
    offA();
    emit("second", false);

    expect(a).toEqual(["first"]);
    expect(b).toEqual(["first", "second"]);
  });

  it("registering the same callback twice delivers to both subscriptions", async () => {
    // Subscriptions are identified by their registration, not by callback
    // identity — two components can legitimately pass the same function.
    const client = new TauriTerminalClient();
    let calls = 0;
    const cb = () => {
      calls += 1;
    };
    const off = client.onOutput("r6", cb);
    client.onOutput("r6", cb);
    const emit = await outputBridge("r6");

    emit("x", false);
    expect(calls).toBe(2);

    off();
    emit("y", false);
    expect(calls).toBe(3);
  });
});
