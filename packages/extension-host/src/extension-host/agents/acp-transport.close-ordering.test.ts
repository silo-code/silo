// The close→respawn ordering guarantee (RFC 0042 reconnect). `acp_close` now
// resolves only once the agent process is really gone, but the reconnect
// path's close comes from a React effect cleanup, which is synchronous and
// cannot await it. So `connect()` is what enforces the ordering: it waits for
// any still-pending close of the *same* agent CLI before spawning, because the
// old process may still hold that CLI's config directory and session store.
//
// The Tauri boundary is mocked so this stays a fast, app-free unit; the real
// process lifecycle is covered by the Rust tests in `commands/acp.rs`.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { invokeMock, listenMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  listenMock: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }));

import { createAcpTransport } from "./acp-transport";

/** A deferred, so a test can hold `acp_close` open and observe the ordering. */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("createAcpTransport close→spawn ordering", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    listenMock.mockReset();
    listenMock.mockResolvedValue(() => {});
  });

  /** Record the order commands reach the host, with `acp_close` gated. */
  function wire(close: Promise<void>) {
    const calls: string[] = [];
    let n = 0;
    invokeMock.mockImplementation(async (cmd: string) => {
      calls.push(cmd);
      if (cmd === "acp_close") await close;
      if (cmd === "acp_spawn")
        return { connectionId: `c${++n}`, pid: 100 + n, envReport: {} };
      return undefined;
    });
    return calls;
  }

  it("holds a respawn of the same agent until the previous close finishes", async () => {
    const close = deferred();
    const calls = wire(close.promise);

    const first = createAcpTransport({ command: "codex", args: ["acp"] });
    await first.connect();
    void first.disconnect();
    expect(calls).toEqual(["acp_spawn", "acp_close"]);

    // The reconnect: a brand-new transport for the same CLI.
    const second = createAcpTransport({ command: "codex", args: ["acp"] });
    let spawned = false;
    const connecting = second.connect().then(() => {
      spawned = true;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(spawned).toBe(false);
    expect(calls).toEqual(["acp_spawn", "acp_close"]);

    close.resolve();
    await connecting;
    expect(spawned).toBe(true);
    expect(calls).toEqual(["acp_spawn", "acp_close", "acp_spawn"]);
  });

  it("does not make one agent's close block a different agent's spawn", async () => {
    const close = deferred();
    wire(close.promise);

    const codex = createAcpTransport({ command: "codex", args: ["acp"] });
    await codex.connect();
    void codex.disconnect();

    // Different CLI, different config dir — nothing to contend over.
    const cursor = createAcpTransport({ command: "cursor-agent" });
    await expect(cursor.connect()).resolves.toBeDefined();

    close.resolve();
  });

  it("stops waiting once the close settles, so a later connect is not held", async () => {
    const close = deferred();
    wire(close.promise);

    const first = createAcpTransport({ command: "pi" });
    await first.connect();
    const closed = first.disconnect();
    close.resolve();
    await closed;

    const second = createAcpTransport({ command: "pi" });
    await expect(second.connect()).resolves.toBeDefined();
  });

  it("resolves disconnect even when acp_close rejects, so a respawn is never wedged", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "acp_close") throw new Error("unknown connection");
      if (cmd === "acp_spawn")
        return { connectionId: "c1", pid: 1, envReport: {} };
      return undefined;
    });

    const first = createAcpTransport({ command: "claude" });
    await first.connect();
    await expect(first.disconnect()).resolves.toBeUndefined();

    const second = createAcpTransport({ command: "claude" });
    await expect(second.connect()).resolves.toBeDefined();
  });

  it("is a no-op when there was never a connection", async () => {
    invokeMock.mockResolvedValue(undefined);
    const t = createAcpTransport({ command: "codex" });
    await expect(t.disconnect()).resolves.toBeUndefined();
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
