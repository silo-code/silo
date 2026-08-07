// Integration test (Layer 2): live regression guard for symptom 1 (ADR 0034)
// — a center dock split into two groups, terminals on the left, editors on
// the right. Focus a terminal in the LEFT group, switch workspaces and back,
// and the terminal must still be the active tab rather than the right
// group's editor.
//
// Root cause: re-entering a workspace re-mounts every panel in its dock, and
// TextViewer/DiffPanel's mount-time `retryFocus` passed no `stillWanted`
// guard — so a background editor grabbed DOM focus on re-mount. Because
// dockview marks a panel's group active when focus lands inside it
// (`contentContainer.onDidFocus → doSetGroupActive`), that steal also flipped
// the visible active tab.
//
// TIMING MATTERS HERE, and it isn't cosmetic. Earlier drafts of this exact
// scenario, run with 200-300ms settle delays between actions, passed cleanly
// even against the broken (pre-fix) build — 0 failures across dozens of
// rounds — and were wrongly read as "scripted automation can't reproduce this
// bug, only real interaction can." That conclusion was wrong. Reverting the
// fix locally and widening these delays to match the cadence actually
// observed in a real manual reproduction (roughly 1-2s between actions, not
// 200-300ms) reproduced it immediately: 3 of 4 rounds failed. The original
// short-delay version wasn't measuring "can automation trigger this" — it was
// running faster than whatever real settle time (Monaco/`@monaco-editor/react`
// layout and mount work) the race actually depends on. Keep these delays as
// wide as they are; shortening them for speed silently turns this back into a
// test that can't fail. If you need to add more scenarios, prefer more rounds
// over shorter sleeps.
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
    "[workspace-revisit-split-dock.it] no dev app reachable on :7878 — " +
      "skipping. Run `pnpm dev` to exercise this suite.",
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!available)(
  "revisiting a workspace with a split dock keeps the focused group's tab",
  () => {
    let folderA: string;
    let folderB: string;
    let priorActive: string | null;
    let wsA: string;
    let wsB: string;

    beforeAll(async () => {
      priorActive = (await silo.listWorkspaces()).active;
      folderA = await mkdtemp(join(tmpdir(), "silo-it-split-a-"));
      folderB = await mkdtemp(join(tmpdir(), "silo-it-split-b-"));
      await writeFile(join(folderA, "one.txt"), "one\n");
      wsA = (await silo.openWorkspace(folderA, "it-split-a")).id;
      wsB = (await silo.openWorkspace(folderB, "it-split-b")).id;

      await silo.activateWorkspace(wsB);
      await silo.openTerminal(folderB);
    }, 60000);

    afterAll(async () => {
      if (wsA) await silo.deleteWorkspace(wsA);
      if (wsB) await silo.deleteWorkspace(wsB);
      if (priorActive) await silo.activateWorkspace(priorActive);
      await rm(folderA, { recursive: true, force: true });
      await rm(folderB, { recursive: true, force: true });
    });

    it(
      "focused left-group terminal survives a revisit — doesn't fall back to the right group's editor",
      { timeout: 120000 },
      async () => {
        let failures = 0;
        const rounds = 4;
        for (let round = 0; round < rounds; round++) {
          await silo.activateWorkspace(wsA);
          await sleep(1500); // let the workspace fully settle, like a real session

          const term = await silo.openTerminal(folderA);
          const termA = term.terminalId;
          await sleep(1000);
          await silo.openFile(join(folderA, "one.txt"));
          await sleep(1000);
          const { groups } = await silo.splitActivePanel("right");
          expect(
            groups,
            `round ${round}: split didn't produce two groups`,
          ).toBe(2);
          await sleep(1500); // let the split settle — real editor layout/mount time

          await silo.focusTerminal(termA);
          await sleep(1200); // let the focus fully settle before leaving
          const before = await silo.activePanel();
          expect(
            before.panelId,
            `round ${round}: setup didn't leave the terminal focused`,
          ).toBe(`terminal:${termA}`);

          await silo.activateWorkspace(wsB);
          await sleep(1600); // matches the ~1.6s gap observed in a real manual repro

          await silo.activateWorkspace(wsA);
          await sleep(1200); // matches the ~1.2s settle gap observed in a real manual repro

          const after = await silo.activePanel();
          if (after.panelId !== `terminal:${termA}`) {
            failures++;
            // eslint-disable-next-line no-console
            console.warn(
              `round ${round}: expected terminal:${termA}, got ${after.panelId}`,
            );
          }

          // Reset to a clean single-panel state for the next round (close
          // everything in A so the next round's split starts fresh).
          await silo.deleteWorkspace(wsA);
          wsA = (await silo.openWorkspace(folderA, "it-split-a")).id;
        }
        expect(
          failures,
          `${failures}/${rounds} rounds landed on the wrong (right-group ` +
            `editor) tab after revisiting a split dock`,
        ).toBe(0);
      },
    );
  },
);
