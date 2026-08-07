// Integration test (Layer 2): end-to-end coverage of the layout symptom 1 was
// reported against (ADR 0034) — a center dock split into two groups, terminals
// on the left, editors on the right. Focus a terminal in the LEFT group,
// switch workspaces and back, and the terminal must still be the active tab
// rather than the right group's editor.
//
// HONESTY NOTE about what this does and does not guard. This test never
// reproduced the bug: driving the jump through the automation API doesn't
// re-mount a *background* editor panel the way real interaction does, and the
// re-mount is what triggered it (see below). It passed against the broken
// build. Keep it as end-to-end coverage of the reported layout, but do NOT
// treat it as the regression guard.
//
// The real regression guard is a unit test —
// `use-focus-retry.test.ts` → "never grabs on mount when the panel is not the
// active tab" — which encodes the actual invariant deterministically, plus
// `retryFocus`'s now-required `stillWanted` parameter, which makes omitting
// the guard a compile error rather than a silent focus steal.
//
// Root cause, for the record: re-entering a workspace re-mounts every panel in
// its dock, and TextViewer/DiffPanel's mount-time `retryFocus` passed no
// `stillWanted` guard — so a background editor grabbed DOM focus on re-mount.
// Because dockview marks a panel's group active when focus lands inside it
// (`contentContainer.onDidFocus → doSetGroupActive`), that steal also flipped
// the visible active tab.
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
      await writeFile(join(folderA, "two.txt"), "two\n");
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
        const totalCycles = 5 * 3; // 5 rounds x 3 switch-away/back cycles each
        for (let round = 0; round < 5; round++) {
          await silo.activateWorkspace(wsA);
          await sleep(200);

          // Three terminals in the left group (matches the tab-dense left
          // group in the report, not just a single lonely tab). One file
          // opens as a tab alongside them (no group shows a file yet), then
          // splitActivePanel moves it (the now-active panel) to a new right
          // group. A second file opens AFTER the split, once the right group
          // is both active and already showing a file — findEditorTargetGroup
          // then targets that group, landing the second file there too
          // instead of back with the terminals. Order matters: opening both
          // files before splitting only moves whichever was active at split
          // time, stranding the other one in the left group.
          const t1 = await silo.openTerminal(folderA);
          await silo.openTerminal(folderA);
          await silo.openTerminal(folderA);
          await silo.openFile(join(folderA, "one.txt"));
          const { groups } = await silo.splitActivePanel("right");
          expect(
            groups,
            `round ${round}: split didn't produce two groups`,
          ).toBe(2);
          await silo.openFile(join(folderA, "two.txt"));

          const termA = t1.terminalId;

          // Simulate actually working across the left group's tabs — not
          // just landing on T1 once — before settling on it: focus a
          // different terminal, then focus T1, matching "I was on another
          // agent tab, then focused this one" rather than a bare first-touch.
          const t2 = await silo.listTerminals(wsA);
          const other = t2.terminals.find((t) => t.id !== termA)?.id;
          if (other) {
            await silo.focusTerminal(other);
            await sleep(150);
          }
          await silo.focusTerminal(termA);
          await sleep(300);
          const before = await silo.activePanel();
          expect(
            before.panelId,
            `round ${round}: setup didn't leave the terminal focused`,
          ).toBe(`terminal:${termA}`);

          // Multiple switch-away/switch-back cycles within the same round —
          // in case the first revisit is clean but a later one isn't.
          for (let cycle = 0; cycle < 3; cycle++) {
            await silo.activateWorkspace(wsB);
            await sleep(300);

            await silo.activateWorkspace(wsA);
            await sleep(300);

            const after = await silo.activePanel();
            if (after.panelId !== `terminal:${termA}`) {
              failures++;
              // eslint-disable-next-line no-console
              console.warn(
                `round ${round} cycle ${cycle}: expected terminal:${termA}, got ${after.panelId}`,
              );
            }
          }

          // Reset to a clean single-panel state for the next round (close
          // everything in A so the next round's split starts fresh).
          await silo.deleteWorkspace(wsA);
          wsA = (await silo.openWorkspace(folderA, "it-split-a")).id;
        }
        expect(
          failures,
          `${failures}/${totalCycles} switch-away/back cycles landed on the ` +
            `wrong (right-group editor) tab after revisiting a split dock`,
        ).toBe(0);
      },
    );
  },
);
