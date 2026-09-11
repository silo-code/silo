import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CHAT_CONFIG_PROBE_CACHE_TTL_MS,
  CHAT_CONFIG_PROBE_TIMEOUT_MS,
  _resetChatConfigProbeCacheForTests,
  chatConfigProbeCacheKey,
  chatConfigProbeCacheSizeForTests,
  peekCachedChatConfigOptions,
  probeChatConfigOptions,
} from "./probe-chat-config-options";

const fakeClient = {
  initialize: vi.fn(),
  newSession: vi.fn(),
  dispose: vi.fn(),
};

vi.mock("./acp-transport", () => ({
  createAcpTransport: vi.fn(() => ({})),
}));

vi.mock("./acp-jsonrpc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./acp-jsonrpc")>();
  return {
    ...actual,
    createAcpClient: vi.fn(() => fakeClient),
  };
});

const launch = {
  command: "npx",
  args: ["-y", "claude-agent-acp"],
  env: { CLAUDE_CONFIG_DIR: "/tmp/.claude" },
};

const options = [
  {
    id: "mode",
    name: "Mode",
    category: "mode",
    type: "select",
    currentValue: "default",
    options: [{ value: "default", name: "Manual" }],
  },
];

afterEach(() => {
  _resetChatConfigProbeCacheForTests();
  vi.clearAllMocks();
});

describe("chatConfigProbeCacheKey", () => {
  it("ignores key order in env", () => {
    expect(
      chatConfigProbeCacheKey({
        command: "npx",
        args: ["a"],
        env: { B: "2", A: "1" },
      }),
    ).toBe(
      chatConfigProbeCacheKey({
        command: "npx",
        args: ["a"],
        env: { A: "1", B: "2" },
      }),
    );
  });
});

describe("probeChatConfigOptions cache", () => {
  it("returns a fresh result from the cache without spawning again", async () => {
    fakeClient.initialize.mockResolvedValue({});
    fakeClient.newSession.mockResolvedValue({
      sessionId: "s1",
      configOptions: [
        {
          id: "mode",
          name: "Mode",
          category: "mode",
          type: "select",
          currentValue: "default",
          options: [{ value: "default", name: "Manual" }],
        },
      ],
    });

    const first = await probeChatConfigOptions(launch, "/tmp");
    expect(first).toEqual(options);
    expect(fakeClient.initialize).toHaveBeenCalledTimes(1);

    const second = await probeChatConfigOptions(launch, "/tmp");
    expect(second).toEqual(options);
    expect(fakeClient.initialize).toHaveBeenCalledTimes(1);
  });

  it("expires entries after the TTL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    fakeClient.initialize.mockResolvedValue({});
    fakeClient.newSession.mockResolvedValue({
      sessionId: "s1",
      configOptions: [
        {
          id: "mode",
          name: "Mode",
          category: "mode",
          type: "select",
          currentValue: "default",
          options: [{ value: "default", name: "Manual" }],
        },
      ],
    });

    await probeChatConfigOptions(launch, "/tmp");
    vi.setSystemTime(new Date(Date.now() + CHAT_CONFIG_PROBE_CACHE_TTL_MS + 1));
    expect(peekCachedChatConfigOptions(launch)).toBeUndefined();

    await probeChatConfigOptions(launch, "/tmp");
    expect(fakeClient.initialize).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

describe("probeChatConfigOptions timeout", () => {
  it("kills the child and reports the timeout when the agent never answers", async () => {
    vi.useFakeTimers();
    // An agent that spawns but never replies. Nothing else can reap this
    // child — a probe's process is not in `chat-agent-registry` — so the only
    // thing standing between this and a leak until app exit is the timeout.
    //
    // `fakeClient.dispose` deliberately does nothing to the pending request,
    // unlike the real client (which rejects it). That is the point: the probe
    // must settle on the timeout alone, without depending on the client's
    // internals to unblock it.
    fakeClient.initialize.mockReturnValue(new Promise(() => {}));

    const probe = probeChatConfigOptions(launch, "/tmp");
    const settled = expect(probe).rejects.toThrow(/did not answer within 15s/);

    await vi.advanceTimersByTimeAsync(CHAT_CONFIG_PROBE_TIMEOUT_MS + 1);
    await settled;

    expect(fakeClient.dispose).toHaveBeenCalled();
    expect(fakeClient.newSession).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("does not cache a timed-out probe", async () => {
    vi.useFakeTimers();
    fakeClient.initialize.mockReturnValue(new Promise(() => {}));

    const probe = probeChatConfigOptions(launch, "/tmp");
    const settled = expect(probe).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(CHAT_CONFIG_PROBE_TIMEOUT_MS + 1);
    await settled;

    expect(peekCachedChatConfigOptions(launch)).toBeUndefined();
    vi.useRealTimers();
  });

  it("surfaces a real failure as itself rather than as a timeout", async () => {
    fakeClient.initialize.mockRejectedValue(new Error("ENOENT: no such file"));

    await expect(probeChatConfigOptions(launch, "/tmp")).rejects.toThrow(
      /ENOENT/,
    );
    expect(fakeClient.dispose).toHaveBeenCalled();
  });

  it("clears the timer on success, leaving no pending dispose", async () => {
    vi.useFakeTimers();
    fakeClient.initialize.mockResolvedValue({});
    fakeClient.newSession.mockResolvedValue({
      sessionId: "s1",
      configOptions: [],
    });

    await probeChatConfigOptions(launch, "/tmp");
    const disposesAfterProbe = fakeClient.dispose.mock.calls.length;
    await vi.advanceTimersByTimeAsync(CHAT_CONFIG_PROBE_TIMEOUT_MS * 2);

    expect(fakeClient.dispose.mock.calls.length).toBe(disposesAfterProbe);
    vi.useRealTimers();
  });
});

describe("probe cache pruning", () => {
  it("drops an expired entry nobody read back", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    fakeClient.initialize.mockResolvedValue({});
    fakeClient.newSession.mockResolvedValue({
      sessionId: "s1",
      configOptions: [],
    });

    await probeChatConfigOptions({ ...launch, command: "stale" }, "/tmp");
    expect(chatConfigProbeCacheSizeForTests()).toBe(1);

    // A different launch line, probed after the first has expired. The first
    // entry is never read again, so only a write-time prune can evict it —
    // and its key embeds the profile's `env`.
    vi.setSystemTime(new Date(Date.now() + CHAT_CONFIG_PROBE_CACHE_TTL_MS + 1));
    await probeChatConfigOptions({ ...launch, command: "fresh" }, "/tmp");

    expect(chatConfigProbeCacheSizeForTests()).toBe(1);
    expect(
      peekCachedChatConfigOptions({ ...launch, command: "stale" }),
    ).toBeUndefined();
    vi.useRealTimers();
  });
});
