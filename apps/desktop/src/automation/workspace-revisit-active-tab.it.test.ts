// Integration test (Layer 2): revisiting a workspace (switch away, then back)
// must land on the tab that was active when you left it — no explicit request
// in play, just the dock's own "remembered panel" precedence.
//
// Two scenarios, isolating whether the bug needs something to have happened in
// the backgrounded workspace while you were away, or reproduces on a bare,
// activity-free revisit:
//
//   (a) bare revisit — switch A -> B -> A repeatedly, nothing else happens.
//       WorkspaceDock's authority effect (packages/extension-host/src/panels/
//       WorkspaceDock.tsx) re-asserts lastActivePanelRef on return via
//       resolveActivationTarget, so this is expected to hold even before any
//       fix — it's the control. If this scenario ever fails, the bug is
//       broader than the leading hypothesis and needs re-investigation before
//       shipping a fix.
//
//   (b) revisit after a terminal is added to A while it's backgrounded —
//       simulating an agent spawning a terminal in a workspace you're not
//       looking at. WorkspaceDock's panel-reconciliation effect (same file,
//       the terminal/editor sync effect) force-activates a newly-added panel
//       via panel.api.setActive() and is NOT gated on the `active` prop, so it
//       can silently commandeer a backgrounded workspace's active tab without
//       going through the authority effect or updating lastActivePanelRef.
//       This is the scenario expected to fail pre-fix if that's the real
//       trigger for symptom 1.
//
// 6 rounds each (more than the usual 4) — this is the least-confirmed root
// cause of the three symptoms, so a clean negative result needs more samples
// to be trustworthy, and a positive one needs to show it's not a one-off.
//
// No DOM focus involved (dockview's active panel is the ground truth), so
// unlike new-terminal-focus.it this doesn't need the window frontmost.
//
// Requires the dev app running (`pnpm dev`); skips otherwise.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SiloAutomation } from "./client";

const silo = new SiloAutomation();
const available = await silo.available();

if (!available) {
  // eslint-disable-next-line no-console
  console.warn(
    "[workspace-revisit-active-tab.it] no dev app reachable on :7878 — " +
      "skipping. Run `pnpm dev` to exercise this suite.",
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!available)(
  "revisiting a workspace keeps its active tab",
  () => {
    let folderA: string;
    let folderB: string;
    let priorActive: string | null;
    let wsA: string;
    let wsB: string;
    let termA2: string;

    beforeAll(async () => {
      priorActive = (await silo.listWorkspaces()).active;
      folderA = await mkdtemp(join(tmpdir(), "silo-it-revisit-a-"));
      folderB = await mkdtemp(join(tmpdir(), "silo-it-revisit-b-"));
      wsA = (await silo.openWorkspace(folderA, "it-revisit-a")).id;
      wsB = (await silo.openWorkspace(folderB, "it-revisit-b")).id;

      // Two terminals in A — the second one is active when we leave, so a
      // reversion to "whatever dockview happens to remember" is distinguishable
      // from a reversion to the correct (second) tab.
      await silo.activateWorkspace(wsA);
      await silo.openTerminal(folderA);
      termA2 = (await silo.openTerminal(folderA)).terminalId;

      await silo.activateWorkspace(wsB);
      await silo.openTerminal(folderB);

      await silo.activateWorkspace(wsA);
      await sleep(400);
    }, 60000);

    afterAll(async () => {
      if (wsA) await silo.deleteWorkspace(wsA);
      if (wsB) await silo.deleteWorkspace(wsB);
      if (priorActive) await silo.activateWorkspace(priorActive);
      await rm(folderA, { recursive: true, force: true });
      await rm(folderB, { recursive: true, force: true });
    });

    it(
      "(a) bare revisit — no activity while away",
      { timeout: 60000 },
      async () => {
        for (let round = 0; round < 6; round++) {
          await silo.activateWorkspace(wsA);
          await silo.activatePanel(`terminal:${termA2}`);
          await sleep(300);

          await silo.activateWorkspace(wsB);
          await sleep(300);

          await silo.activateWorkspace(wsA);
          await sleep(300);

          const { panelId } = await silo.activePanel();
          expect(
            panelId,
            `round ${round}: bare revisit lost the remembered tab`,
          ).toBe(`terminal:${termA2}`);
        }
      },
    );

    it(
      "(b) revisit after a terminal is added to A while backgrounded",
      { timeout: 60000 },
      async () => {
        for (let round = 0; round < 6; round++) {
          await silo.activateWorkspace(wsA);
          await silo.activatePanel(`terminal:${termA2}`);
          await sleep(300);

          await silo.activateWorkspace(wsB);
          await sleep(200);

          // Simulate an agent spawning a terminal in A while the user is in B.
          // Left open for the rest of the run (no close-terminal op exists on
          // the automation bridge) — afterAll's deleteWorkspace(wsA) reaps
          // everything, and a growing terminal count in A doesn't affect
          // whether termA2 stays the remembered/active tab.
          await silo.openTerminal(folderA, wsA);
          await sleep(300); // let A's panel-reconciliation effect run

          await silo.activateWorkspace(wsA);
          await sleep(300);

          const { panelId } = await silo.activePanel();
          expect(
            panelId,
            `round ${round}: background terminal add hijacked A's remembered tab`,
          ).toBe(`terminal:${termA2}`);
        }
      },
    );
  },
);
