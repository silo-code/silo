// Global backstop for the integration suite (Layer 2).
//
// Per-file `afterAll` hooks are the primary cleanup path for the PTY
// sessions this suite spawns (e.g. `workspace-pty-lifecycle.it.test.ts`'s
// `deleteWorkspace` calls, which reap PTYs through the real `T_KILL` path).
// This catches the case a hook never gets to run — a test file that crashes
// or is interrupted (Ctrl-C) mid-suite.
//
// Snapshot-diff, NOT "kill everything in the `dev` namespace": `pnpm dev` is
// normally running interactively while `pnpm test:it` runs against it, so
// the `dev` namespace can hold real terminals the developer cares about.
// Only sessions that are newly live at teardown time — absent from the
// snapshot taken before this run started — are ever killed.
//
// Talks to `pty-host` directly, not the dev-app automation RPC: the RPC
// needs the app alive and responsive, which can't be assumed in exactly the
// failure modes this exists to catch (the ownership lease already handles a
// dead dev app on its own timeline — this backstop targets the surviving-app
// case, a test-runner crash while `pnpm dev` keeps running).

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ptyHostManifest = resolve(here, "../../../../crates/pty-host/Cargo.toml");

function runPtyHost(args: string[]): string | null {
  const result = spawnSync(
    "cargo",
    [
      "run",
      "--quiet",
      "--manifest-path",
      ptyHostManifest,
      "--bin",
      "pty-host",
      "--",
      "-n",
      "dev",
      ...args,
    ],
    { encoding: "utf8" },
  );
  if (result.error || result.status !== 0) {
    return null;
  }
  return result.stdout;
}

/**
 * Live session names in the `dev` namespace, or `null` if it couldn't be
 * determined — kept distinct from "confirmed zero" so a failed lookup can't
 * be mistaken for an empty namespace and trigger a sweep it has no business
 * running.
 */
function liveSessionNames(): Set<string> | null {
  const out = runPtyHost(["list"]);
  if (out === null) return null;
  const names = new Set<string>();
  for (const line of out.split("\n")) {
    const [name] = line.split("\t");
    if (name && line.includes("\tlive")) {
      names.add(name);
    }
  }
  return names;
}

export default function setup() {
  const before = liveSessionNames();

  return function teardown() {
    // Fail-safe, not fail-open: if we couldn't determine the starting state,
    // skip the sweep rather than risk treating "unknown" as "empty" and
    // killing sessions that predate this run.
    if (before === null) return;

    const after = liveSessionNames();
    if (after === null) return;

    for (const name of after) {
      if (!before.has(name)) {
        runPtyHost(["kill", name]);
      }
    }
  };
}
