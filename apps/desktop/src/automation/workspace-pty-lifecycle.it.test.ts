// Integration test (Layer 2): soft-close vs hard-delete PTY lifecycle.
//
// Regression guards for:
//   1. Soft-close must keep terminal records and live PTY sessions (including
//      when CenterDock unmounts into the empty state — previously killed PTYs
//      via a bad TerminalPanel unmount lookup).
//   2. Hard-delete (ctx.workspaces.delete) must reap every PTY in the workspace.
//
// Requires the dev app running (`pnpm dev`); skips otherwise.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SiloAutomation } from "./client";

const silo = new SiloAutomation();
const available = await silo.available();

if (!available) {
  // eslint-disable-next-line no-console
  console.warn(
    "[workspace-pty-lifecycle.it] no dev app reachable on :7878 — skipping. " +
      "Run `pnpm dev` to exercise this suite.",
  );
}

/**
 * Open a shell tab and wait until its PTY has spawned. Mounts the panel, then
 * force-spawns via sendText (same on-demand path as unmounted `ctx.terminals`
 * writes) so we don't depend on dock focus timing.
 */
async function spawnTerminal(
  workspaceId: string,
  cwd: string,
): Promise<{ terminalId: string; sessionId: string }> {
  const { terminalId, panelId } = await silo.openTerminal(cwd);
  try {
    await silo.activatePanel(panelId);
  } catch {
    // Panel may not be in the dock yet — sendText force-spawns regardless.
  }
  // Nudge the PTY awake without running a command (no trailing CR).
  await silo.sendText(terminalId, "", false);
  let sessionId = "";
  await expect
    .poll(
      async () => {
        const list = await silo.listTerminals(workspaceId);
        const rec = list.terminals.find((t) => t.id === terminalId);
        sessionId = rec?.sessionId ?? "";
        return sessionId;
      },
      { timeout: 15000, interval: 100 },
    )
    .not.toBe("");
  return { terminalId, sessionId };
}

describe.skipIf(!available)("workspace close vs delete PTY lifecycle", () => {
  let folderA: string;
  let folderB: string;
  let priorActive: string | null;
  let wsA: string;
  let wsB: string;

  beforeAll(async () => {
    priorActive = (await silo.listWorkspaces()).active;
    folderA = await mkdtemp(join(tmpdir(), "silo-it-pty-a-"));
    folderB = await mkdtemp(join(tmpdir(), "silo-it-pty-b-"));
    await writeFile(join(folderA, "readme.txt"), "a\n");
    await writeFile(join(folderB, "readme.txt"), "b\n");
    wsA = (await silo.openWorkspace(folderA, "it-pty-a")).id;
    wsB = (await silo.openWorkspace(folderB, "it-pty-b")).id;
  });

  afterAll(async () => {
    // Best-effort teardown — tests may have already deleted one or both.
    for (const id of [wsA, wsB]) {
      if (!id) continue;
      try {
        await silo.deleteWorkspace(id);
      } catch {
        /* already gone */
      }
    }
    if (priorActive) {
      try {
        await silo.activateWorkspace(priorActive);
      } catch {
        /* unknown */
      }
    }
    await rm(folderA, { recursive: true, force: true });
    await rm(folderB, { recursive: true, force: true });
  });

  it(
    "soft-close keeps the PTY alive and the terminal record intact",
    { timeout: 30000 },
    async () => {
      await silo.activateWorkspace(wsA);
      const { terminalId, sessionId } = await spawnTerminal(wsA, folderA);

      // Keeper workspace stays open so this is a warm soft-close (dock stays
      // mounted). The empty-state path is covered by the next test when it can
      // reach active === null.
      const closed = await silo.closeWorkspace(wsA);
      expect(closed.closed).toBe(true);
      expect(closed.active).not.toBe(wsA);

      const list = await silo.listWorkspaces();
      const entry = list.workspaces.find((w) => w.id === wsA);
      expect(entry?.closedAt).toBeTruthy();

      const terminals = await silo.listTerminals(wsA);
      expect(
        terminals.terminals.find((t) => t.id === terminalId)?.sessionId,
      ).toBe(sessionId);

      expect((await silo.processAlive(sessionId)).alive).toBe(true);

      // Reopen and confirm the same session is still attachable.
      await silo.activateWorkspace(wsA);
      expect((await silo.processAlive(sessionId)).alive).toBe(true);
    },
  );

  it(
    "soft-close of the last open sandbox keeps the PTY when the app hits empty state",
    { timeout: 30000 },
    async () => {
      // Soft-close every sandbox we control, then ask: if that left the app with
      // no open workspace (active === null), CenterDock unmounts warmed docks —
      // the regression path that previously killed PTYs. When the user's session
      // has other open workspaces we can't force empty state; skip in that case.
      await silo.activateWorkspace(wsA);
      const { sessionId } = await spawnTerminal(wsA, folderA);

      await silo.closeWorkspace(wsA);
      await silo.closeWorkspace(wsB);

      const after = await silo.listWorkspaces();
      if (after.active !== null) {
        // eslint-disable-next-line no-console
        console.warn(
          "[workspace-pty-lifecycle.it] other workspaces still open " +
            `(active=${after.active}) — skipping empty-state PTY assertion.`,
        );
        // Still assert soft-close itself didn't kill this sandbox's PTY.
        expect((await silo.processAlive(sessionId)).alive).toBe(true);
        await silo.activateWorkspace(wsA);
        await silo.activateWorkspace(wsB);
        return;
      }

      // Empty state: panels unmounted, but records + daemon session must live.
      expect((await silo.processAlive(sessionId)).alive).toBe(true);
      const terminals = await silo.listTerminals(wsA);
      expect(terminals.terminals.some((t) => t.sessionId === sessionId)).toBe(
        true,
      );

      await silo.activateWorkspace(wsA);
      await silo.activateWorkspace(wsB);
      expect((await silo.processAlive(sessionId)).alive).toBe(true);
    },
  );

  it("hard-delete reaps the workspace's PTY", { timeout: 30000 }, async () => {
    await silo.activateWorkspace(wsB);
    const { sessionId } = await spawnTerminal(wsB, folderB);
    expect((await silo.processAlive(sessionId)).alive).toBe(true);

    const deleted = await silo.deleteWorkspace(wsB);
    expect(deleted.deleted).toBe(true);
    wsB = ""; // afterAll shouldn't try again

    // closeWorkspace fires terminal_kill without awaiting — poll until the
    // pty-host reaps the session rather than racing the async invoke.
    await expect
      .poll(async () => (await silo.processAlive(sessionId)).alive, {
        timeout: 5000,
        interval: 50,
      })
      .toBe(false);
    const list = await silo.listWorkspaces();
    expect(list.workspaces.some((w) => w.folder === folderB)).toBe(false);
  });
});
