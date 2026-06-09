// Integration test: ctx.process.exec end-to-end through the real service +
// host command (not a mock). Drives the live app over the RPC `processExec` op,
// which calls getProcessService().exec(...) — the exact path the git extension
// (Phase 2) builds on. Pins the contract: stdout/code on success, stderr/code
// on a non-zero exit (which still resolves), cwd is honored, and a slow command
// runs off the UI thread (the app stays responsive).
//
// Requires the dev app (`npm run app:dev`); skips when none is reachable.

import { describe, it, expect } from "vitest";
import { SiloAutomation } from "./client";

const silo = new SiloAutomation();
const available = await silo.available();

if (!available) {
  // eslint-disable-next-line no-console
  console.warn(
    "[process-exec.it] no dev app reachable on :7878 — skipping. " +
      "Run `npm run app:dev` to exercise this suite.",
  );
}

describe.skipIf(!available)("ctx.process.exec", () => {
  it("captures stdout and a zero exit code on success", async () => {
    const res = await silo.processExec("echo", ["hello world"]);
    expect(res.stdout).toBe("hello world\n");
    expect(res.stderr).toBe("");
    expect(res.code).toBe(0);
  });

  it("resolves (not rejects) on a non-zero exit, surfacing stderr + code", async () => {
    const res = await silo.processExec("sh", [
      "-c",
      "echo to-stderr 1>&2; exit 3",
    ]);
    expect(res.code).toBe(3);
    expect(res.stderr).toBe("to-stderr\n");
    expect(res.stdout).toBe("");
  });

  it("runs the command in the given cwd", async () => {
    const res = await silo.processExec("pwd", [], "/tmp");
    // macOS /tmp is a symlink to /private/tmp; accept either.
    expect(res.stdout.trim()).toMatch(/^(\/private)?\/tmp$/);
    expect(res.code).toBe(0);
  });

  it("does not block the UI thread for a slow command", async () => {
    // Fire a ~600ms command and, while it's in flight, round-trip a separate
    // RPC call through the webview. If exec blocked the JS/UI thread, this
    // concurrent op couldn't complete promptly. It returns fast because exec
    // runs off-thread (async command + spawn_blocking on the host).
    const slow = silo.processExec("sh", ["-c", "sleep 0.6; echo done"]);
    const start = Date.now();
    const ping = await silo.eval<number>("1 + 1");
    const elapsed = Date.now() - start;
    expect(ping).toBe(2);
    expect(elapsed).toBeLessThan(400); // well under the 600ms sleep

    const res = await slow;
    expect(res.stdout).toBe("done\n");
    expect(res.code).toBe(0);
  });
});
