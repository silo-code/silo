// Integration test (Layer 2): ctx.terminals.focus() into ANOTHER workspace must
// land on the requested tab — and stay there.
//
// Regression guard for the flip-flop (issue #320): `focus()` used to call
// `setActive()` itself behind a flat `setTimeout(80)` — a guess at how long the
// destination workspace's dock takes to mount — while that dock's own mount
// effect was independently restoring whichever tab the workspace was last on.
// Neither knew about the other, so whichever `setActive()` landed last won: the
// requested tab activated for a moment and then switched away, intermittently,
// depending on frame timing and tab count.
//
// The assertion that matters is therefore not "does it end up right" — which of
// the two racers wins is environment-dependent, and the wrong one winning is
// only the loudest symptom. It's that **no other tab of the destination
// workspace is ever activated**: with the race in place, the dock's own restore
// switches to the remembered tab first and it sits there ~70ms before the other
// racer's timer switches away (measured live), which is the flash users see.
// One authority means one transition, straight to the requested tab.
//
// Runs the jump several times and alternates which tab is requested, so a stale
// "remembered tab" can't accidentally be the right answer.
//
// No DOM focus involved (dockview's active panel is the ground truth), so unlike
// new-terminal-focus.it this doesn't need the window frontmost.
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
    "[cross-workspace-terminal-focus.it] no dev app reachable on :7878 — " +
      "skipping. Run `pnpm dev` to exercise this suite.",
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!available)("cross-workspace ctx.terminals.focus", () => {
  let folderA: string;
  let folderB: string;
  let priorActive: string | null;
  let wsA: string;
  let wsB: string;
  let termB1: string;
  let termB2: string;

  beforeAll(async () => {
    priorActive = (await silo.listWorkspaces()).active;
    folderA = await mkdtemp(join(tmpdir(), "silo-it-xwsfocus-a-"));
    folderB = await mkdtemp(join(tmpdir(), "silo-it-xwsfocus-b-"));
    wsA = (await silo.openWorkspace(folderA, "it-xws-a")).id;
    wsB = (await silo.openWorkspace(folderB, "it-xws-b")).id;

    // Two terminals in B, so B has a "remembered" tab that can lose the race
    // with the requested one. The second one is active when we leave B.
    await silo.activateWorkspace(wsB);
    termB1 = (await silo.openTerminal(folderB)).terminalId;
    termB2 = (await silo.openTerminal(folderB)).terminalId;

    // And one in A, so leaving A is a realistic "I was working over here" state.
    await silo.activateWorkspace(wsA);
    await silo.openTerminal(folderA);
  }, 60000);

  afterAll(async () => {
    if (wsA) await silo.deleteWorkspace(wsA);
    if (wsB) await silo.deleteWorkspace(wsB);
    if (priorActive) await silo.activateWorkspace(priorActive);
    await rm(folderA, { recursive: true, force: true });
    await rm(folderB, { recursive: true, force: true });
  });

  it(
    "activates only the requested tab — no flash of the workspace's remembered tab",
    { timeout: 60000 },
    async () => {
      for (let round = 0; round < 4; round++) {
        // Alternate the target: on the round where we ask for the tab B already
        // remembers, a regression would look like a pass, so never ask for the
        // same one twice running.
        const target = round % 2 === 0 ? termB1 : termB2;
        const other = round % 2 === 0 ? termB2 : termB1;
        const wanted = `terminal:${target}`;

        await silo.activateWorkspace(wsA);
        await sleep(400); // let workspace A settle before timing the jump

        await silo.focusTerminal(target);

        // Sample as fast as the RPC allows for a window that comfortably
        // outlasts every deferred actor (the dock's restore, its 3-RAF focus
        // pass, relayoutAndRefit). Tabs belonging to workspace A, and the brief
        // null while docks swap, are expected in transit — a tab belonging to
        // workspace B that isn't the one we asked for is the bug.
        const seen = new Set<string | null>();
        const started = Date.now();
        let last: string | null = null;
        while (Date.now() - started < 1200) {
          last = (await silo.activePanel()).panelId;
          seen.add(last);
        }

        expect(
          seen,
          `round ${round}: activated a different tab in the ` +
            `destination workspace (the flash)`,
        ).not.toContain(`terminal:${other}`);
        expect(last, `round ${round}: settled on the wrong tab`).toBe(wanted);
      }
    },
  );
});
