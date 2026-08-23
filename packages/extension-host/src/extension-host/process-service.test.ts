// Unit test for the ctx.process.exec wiring: the service must forward to the
// host `process_exec` command with the exact argument shape, default cwd to
// undefined when omitted, and pass the result through untouched. The real
// subprocess behavior (stdout/stderr/code, non-blocking) is exercised end-to-end
// against the live app in process-exec.it.test.ts; here the Tauri boundary is
// mocked so this stays a fast, app-free unit.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { getProcessService } from "./process-service";

describe("ProcessService.exec", () => {
  beforeEach(() => invokeMock.mockReset());

  it("invokes process_exec with command, args, and cwd", async () => {
    const result = { stdout: "ok\n", stderr: "", code: 0 };
    invokeMock.mockResolvedValue(result);

    const out = await getProcessService().exec("git", ["status", "-s"], {
      cwd: "/repo",
    });

    expect(invokeMock).toHaveBeenCalledWith("process_exec", {
      command: "git",
      args: ["status", "-s"],
      cwd: "/repo",
    });
    expect(out).toBe(result);
  });

  it("defaults cwd to undefined when no options are given", async () => {
    invokeMock.mockResolvedValue({ stdout: "", stderr: "", code: 0 });

    await getProcessService().exec("echo", ["hi"]);

    expect(invokeMock).toHaveBeenCalledWith("process_exec", {
      command: "echo",
      args: ["hi"],
      cwd: undefined,
    });
  });
});

describe("ProcessService.exec — env / timeout / signal (B9)", () => {
  beforeEach(() => invokeMock.mockReset());

  const execCall = () =>
    invokeMock.mock.calls.find((c) => c[0] === "process_exec")!;

  it("forwards env and does not arm cancellation (no execId)", async () => {
    invokeMock.mockResolvedValue({ stdout: "", stderr: "", code: 0 });
    await getProcessService().exec("git", ["log"], {
      cwd: "/r",
      env: { GIT_PAGER: "cat" },
    });
    expect(execCall()[1]).toMatchObject({
      command: "git",
      env: { GIT_PAGER: "cat" },
    });
    expect(execCall()[1].execId).toBeUndefined();
  });

  it("rejects with AbortError and kills the group on timeout", async () => {
    invokeMock.mockImplementation((cmd: string) =>
      cmd === "process_exec" ? new Promise(() => {}) : Promise.resolve(),
    );
    const p = getProcessService().exec("sleep", ["10"], { timeoutMs: 5 });
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
    const execId = execCall()[1].execId;
    expect(typeof execId).toBe("string");
    expect(invokeMock).toHaveBeenCalledWith("process_exec_kill", { execId });
  });

  it("rejects and kills when the signal aborts mid-run", async () => {
    invokeMock.mockImplementation((cmd: string) =>
      cmd === "process_exec" ? new Promise(() => {}) : Promise.resolve(),
    );
    const controller = new AbortController();
    const p = getProcessService().exec("sleep", ["10"], {
      signal: controller.signal,
    });
    controller.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
    expect(invokeMock).toHaveBeenCalledWith("process_exec_kill", {
      execId: execCall()[1].execId,
    });
  });

  it("rejects immediately without spawning when the signal is pre-aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const p = getProcessService().exec("sleep", ["10"], {
      signal: controller.signal,
    });
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("resolves normally and never kills when the process finishes first", async () => {
    const result = { stdout: "done", stderr: "", code: 0 };
    invokeMock.mockImplementation((cmd: string) =>
      cmd === "process_exec" ? Promise.resolve(result) : Promise.resolve(),
    );
    const out = await getProcessService().exec("echo", ["hi"], {
      timeoutMs: 10_000,
    });
    expect(out).toEqual(result);
    expect(invokeMock).not.toHaveBeenCalledWith(
      "process_exec_kill",
      expect.anything(),
    );
  });
});

describe("the SILO_* reservation at the service boundary (RFC 0028)", () => {
  beforeEach(() => invokeMock.mockReset());

  it("strips reserved keys from exec, keeping the caller's own variables", async () => {
    invokeMock.mockResolvedValue({ stdout: "", stderr: "", code: 0 });

    // The spoof this closes: launching an agent through `exec` while claiming
    // a terminal id, so a hook event gets attributed to someone else's tab.
    await getProcessService().exec("claude", [], {
      env: { SILO_TERMINAL_ID: "t_victim", GIT_PAGER: "cat" },
    });

    expect(invokeMock).toHaveBeenCalledWith(
      "process_exec",
      expect.objectContaining({ env: { GIT_PAGER: "cat" } }),
    );
  });

  it("sends no env at all when only reserved keys were supplied", async () => {
    invokeMock.mockResolvedValue({ stdout: "", stderr: "", code: 0 });

    await getProcessService().exec("claude", [], {
      env: { SILO_TERMINAL_ID: "t_victim" },
    });

    expect(invokeMock).toHaveBeenCalledWith(
      "process_exec",
      expect.objectContaining({ env: undefined }),
    );
  });
});
