// Integration test (Layer 2): the membership-based PTY maintenance sweep.
//
// Regression guard for the core promise of the orphan-reaping redesign: a
// session is reaped only when it's absent from BOTH the session registry
// AND every existing workspace file's terminal list — never by time alone,
// and never while a workspace still references it, open or closed, no
// matter how long it's been idle.
//
// Drives the real sweep via `triggerMaintenanceSweep` (bypasses the real
// hourly timer, see `session_maintenance.rs`) rather than waiting out real
// time — the whole point of exposing that op. Requires the dev app running
// (`pnpm dev`); skips otherwise.

import { describe, it, expect, beforeAll } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { SiloAutomation } from "./client";

const silo = new SiloAutomation();
const available = await silo.available();

if (!available) {
  // eslint-disable-next-line no-console
  console.warn(
    "[session-maintenance.it] no dev app reachable on :7878 — skipping. " +
      "Run `pnpm dev` to exercise this suite.",
  );
}

const here = dirname(fileURLToPath(import.meta.url));
const ptyHostManifest = resolve(here, "../../../../crates/pty-host/Cargo.toml");

function runPtyHost(args: string[]): void {
  spawnSync(
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
}

/**
 * Spawn an independent daemon via the standalone `pty-host` CLI — deliberately
 * outside the app entirely, so it's registered nowhere and referenced by no
 * workspace until the test says so. `new ... -- sleep 600` both creates and
 * (briefly) attaches; with no stdin piped in, the attach sees immediate EOF
 * and detaches on its own, leaving the daemon running in the background.
 */
function spawnStandaloneDaemon(name: string): void {
  runPtyHost(["new", name, "--", "sleep", "600"]);
}

function killStandaloneDaemon(name: string): void {
  runPtyHost(["kill", name]);
}

async function readRegistry(dataDir: string): Promise<Record<string, string>> {
  const raw = await readFile(
    join(dataDir, "terminal-sessions.json"),
    "utf8",
  ).catch(() => "{}");
  return JSON.parse(raw) as Record<string, string>;
}

async function writeRegistry(
  dataDir: string,
  map: Record<string, string>,
): Promise<void> {
  await writeFile(
    join(dataDir, "terminal-sessions.json"),
    JSON.stringify(map, null, 2),
  );
}

/** Directly register a session_id -> handle mapping, bypassing the app's own
 * `terminal_create` — simulates a session the app knows about (it's in the
 * registry, the same signal `processAlive`/reattach use) but that no
 * workspace's terminal list has ever referenced. */
async function registerOrphanSession(
  dataDir: string,
  sessionId: string,
  handle: string,
): Promise<void> {
  const map = await readRegistry(dataDir);
  map[sessionId] = handle;
  await writeRegistry(dataDir, map);
}

async function forgetSession(
  dataDir: string,
  sessionId: string,
): Promise<void> {
  const map = await readRegistry(dataDir);
  if (sessionId in map) {
    delete map[sessionId];
    await writeRegistry(dataDir, map);
  }
}

/**
 * Does the *persisted* workspace file (not the in-memory state `listTerminals`
 * reads) reference this session yet? The sweep reads straight off disk, and
 * the frontend persists on a 250ms debounce — `listTerminals` can see a
 * terminal's sessionId well before its workspace file is flushed. Triggering
 * a sweep inside that gap would see the session as unreferenced, exactly the
 * race the two-strike rule exists to guard against — so a test that wants to
 * assert "sweeps never touch this" has to wait on the same signal the sweep
 * itself reads, not a faster in-memory proxy for it.
 */
async function workspaceFileReferences(
  configRoot: string,
  workspaceId: string,
  sessionId: string,
): Promise<boolean> {
  const raw = await readFile(
    join(configRoot, "workspaces", `${workspaceId}.json`),
    "utf8",
  ).catch(() => null);
  if (raw === null) return false;
  const terminals = JSON.parse(raw)?.workspace?.terminals as
    | { sessionId?: string }[]
    | undefined;
  return (terminals ?? []).some((t) => t.sessionId === sessionId);
}

describe.skipIf(!available)("PTY session maintenance sweep", () => {
  let dataDir: string;
  let configRoot: string;

  beforeAll(async () => {
    const paths = await silo.debugPaths();
    dataDir = paths.dataDir;
    configRoot = paths.configRoot;
  });

  it(
    "reaps a registered session referenced by no workspace, after two consecutive sweeps",
    { timeout: 30000 },
    async () => {
      const handle = `silo-${randomUUID().slice(0, 8)}`;
      const sessionId = randomUUID();
      spawnStandaloneDaemon(handle);
      await registerOrphanSession(dataDir, sessionId, handle);

      try {
        expect((await silo.processAlive(sessionId)).alive).toBe(true);

        // First sweep: seen unreferenced for the first time — suspected, not
        // yet killed (the two-strike guard against a just-flushed workspace
        // file this session actually belongs to).
        await silo.triggerMaintenanceSweep();
        expect((await silo.processAlive(sessionId)).alive).toBe(true);

        // Second consecutive sweep: still unreferenced — confirmed, reaped.
        await silo.triggerMaintenanceSweep();
        expect((await silo.processAlive(sessionId)).alive).toBe(false);
      } finally {
        // Best-effort: the assertions above should have it dead already:
        // this only matters if this test fails partway through.
        killStandaloneDaemon(handle);
        await forgetSession(dataDir, sessionId);
      }
    },
  );

  it(
    "never reaps a session an open workspace still references, even under repeated triggers",
    { timeout: 30000 },
    async () => {
      const folder = await mkdtemp(join(tmpdir(), "silo-it-maint-"));
      const wsId = (await silo.openWorkspace(folder, "it-maint")).id;
      await silo.activateWorkspace(wsId);

      try {
        const { terminalId, panelId } = await silo.openTerminal(folder);
        try {
          await silo.activatePanel(panelId);
        } catch {
          // Panel may not be in the dock yet — sendText force-spawns regardless.
        }
        await silo.sendText(terminalId, "", false);

        let sessionId = "";
        await expect
          .poll(
            async () => {
              const list = await silo.listTerminals(wsId);
              sessionId =
                list.terminals.find((t) => t.id === terminalId)?.sessionId ??
                "";
              return sessionId;
            },
            { timeout: 15000, interval: 100 },
          )
          .not.toBe("");

        expect((await silo.processAlive(sessionId)).alive).toBe(true);

        // Wait for the workspace file itself (not just in-memory state) to
        // carry this session before sweeping — otherwise both triggers below
        // could land inside the persistence debounce and see it as
        // unreferenced, which is a test-timing bug, not the sweep's.
        await expect
          .poll(() => workspaceFileReferences(configRoot, wsId, sessionId), {
            timeout: 5000,
            interval: 50,
          })
          .toBe(true);

        await silo.triggerMaintenanceSweep();
        await silo.triggerMaintenanceSweep();
        expect((await silo.processAlive(sessionId)).alive).toBe(true);
      } finally {
        await silo.deleteWorkspace(wsId).catch(() => {
          /* already gone */
        });
        await rm(folder, { recursive: true, force: true });
      }
    },
  );
});
