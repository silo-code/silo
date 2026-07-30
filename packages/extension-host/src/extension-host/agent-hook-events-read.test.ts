import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
const homeDir = vi.fn(async () => "/tmp");
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("./platform", () => ({ homeDir }));
vi.mock("./agents-channel", () => ({
  agentsChannel: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

describe("readNewHookEvents", () => {
  beforeEach(async () => {
    invoke.mockReset();
    homeDir.mockReset();
    homeDir.mockResolvedValue("/tmp");
    // Fresh module state per test (checkpoint + path cache + single-flight).
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  async function load() {
    return import("./agent-hook-events");
  }

  it("returns newly appended lines and advances the checkpoint", async () => {
    const { readNewHookEvents } = await load();

    const line = JSON.stringify({
      pid: 1,
      sessionId: "sid-1",
      cwd: "/tmp",
      agent: "claude",
      timestamp: "2026-07-28T12:00:00.000Z",
    });
    invoke.mockResolvedValueOnce(`${line}\n`);
    const first = await readNewHookEvents();
    expect(first).toHaveLength(1);
    expect(first[0]?.sessionId).toBe("sid-1");
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("fs_read_text", {
      path: "/tmp/.silo/agent-hooks/events.jsonl",
    });

    const line2 = JSON.stringify({
      pid: 2,
      sessionId: "sid-2",
      cwd: "/tmp",
      agent: "codex",
      timestamp: "2026-07-28T12:01:00.000Z",
    });
    invoke.mockResolvedValueOnce(`${line}\n${line2}\n`);
    const second = await readNewHookEvents();
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(second).toHaveLength(1);
    expect(second[0]?.sessionId).toBe("sid-2");
  });

  it("coalesces overlapping reads onto one invoke", async () => {
    let resolveRead: (v: string) => void = () => {};
    invoke.mockReturnValue(
      new Promise<string>((resolve) => {
        resolveRead = resolve;
      }),
    );

    const { readNewHookEvents } = await load();

    const a = readNewHookEvents();
    const b = readNewHookEvents();
    // Let both reach invokeReadText.
    await Promise.resolve();
    expect(invoke).toHaveBeenCalledTimes(1);

    resolveRead("");
    await expect(a).resolves.toEqual([]);
    await expect(b).resolves.toEqual([]);
  });

  it("returns [] when the events file is missing", async () => {
    invoke.mockRejectedValueOnce(
      new Error("No such file or directory (os error 2)"),
    );
    const { readNewHookEvents } = await load();
    await expect(readNewHookEvents()).resolves.toEqual([]);
  });
});
