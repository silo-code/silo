// Integration test (Layer 2): a caller that calls ctx.workspaces.activate()
// immediately followed by ctx.terminals.focus() — the exact shape
// agent-inspector's Navigator row click uses (see AgentInspectorPanel.tsx's
// openAndFocus()), and per RFC 0023 the shape the real (closed-source, not in
// this repo) agent-monitor extension's Navigator agent list uses too — must
// still land on the requested tab.
//
// Sibling to cross-workspace-terminal-focus.it.test.ts, which only ever drives
// the jump through silo.focusTerminal() alone. That test passing is not
// evidence this one does: ctx.terminals.focus()'s cross-workspace branch is
// gated on `store.activeWorkspaceId !== wsId`. A caller that already flipped
// store.activeWorkspaceId itself (via ctx.workspaces.activate()) one line
// earlier makes that check false — before WorkspaceDock's authority effect has
// actually committed the new dock as live — so focus() silently takes the
// "same workspace, dock already up" fast path, finds no panel on the (still
// stale) active dock API, and no-ops. requestPanelActivation() — the only
// sanctioned way to register a cross-workspace intent — never gets called, so
// there's no race to "flash and flip back" from: the destination workspace's
// dock just falls through to whatever it already remembers. Unlike the
// existing file's race, this is a pure ordering bug with no timing
// component — expect it to fail on essentially every round pre-fix, not
// intermittently.
//
// Runs the jump several times and alternates which tab is requested, so a
// stale "remembered tab" can't accidentally be the right answer.
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
    "[cross-workspace-activate-then-focus.it] no dev app reachable on :7878 — " +
      "skipping. Run `pnpm dev` to exercise this suite.",
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!available)(
  "cross-workspace activate() immediately followed by terminals.focus()",
  () => {
    let folderA: string;
    let folderB: string;
    let priorActive: string | null;
    let wsA: string;
    let wsB: string;
    let termB1: string;
    let termB2: string;

    beforeAll(async () => {
      priorActive = (await silo.listWorkspaces()).active;
      folderA = await mkdtemp(join(tmpdir(), "silo-it-actf-a-"));
      folderB = await mkdtemp(join(tmpdir(), "silo-it-actf-b-"));
      wsA = (await silo.openWorkspace(folderA, "it-actf-a")).id;
      wsB = (await silo.openWorkspace(folderB, "it-actf-b")).id;

      // Two terminals in B, so B has a "remembered" tab that can win by
      // default when the request is silently dropped. The second one is
      // active when we leave B.
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
      "activates the requested tab even when the caller pre-activates the workspace",
      { timeout: 60000 },
      async () => {
        for (let round = 0; round < 4; round++) {
          const target = round % 2 === 0 ? termB1 : termB2;
          const wanted = `terminal:${target}`;

          await silo.activateWorkspace(wsA);
          await sleep(400); // let workspace A settle before timing the jump

          await silo.activateThenFocusTerminal(wsB, target);

          // Same generous settle window as the sibling test — give every
          // deferred actor (dock mount, onDidAddPanel, relayoutAndRefit) its
          // full budget before checking where things landed.
          await sleep(500);
          const { panelId } = await silo.activePanel();

          expect(
            panelId,
            `round ${round}: expected ${wanted}, got ${panelId} — the ` +
              `pre-activate call likely dropped the cross-workspace request`,
          ).toBe(wanted);
        }
      },
    );
  },
);
