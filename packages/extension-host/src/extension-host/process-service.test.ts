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
