// Integration test (Layer 2): the window regaining OS focus (alt-tabbing back
// from another app — Tauri's onFocusChanged) must never change which tab is
// active. It's allowed to restore DOM keyboard focus (that's the whole point
// of focus-restore.ts — macOS eats the click that reactivates an inactive
// window), but it must restore focus to something in the CURRENTLY ACTIVE
// workspace's dock, never a backgrounded one.
//
// Regression guard for symptom 3: focus-restore.ts's record() blindly
// remembers the last `focusin` anywhere under ".side-pane, .center-body,
// .status-bar" — and CenterDock.tsx keeps every visited workspace's dock
// mounted as a sibling `.dock-host` inside that same shared `.center-body`
// container, only toggling `data-active`. record()'s region selector doesn't
// discriminate between them, so a stray/deferred focusin from a backgrounded
// dock (there are several async focus-retry chains around workspace
// switches — WorkspaceDock's 3-RAF fallback, relayoutAndRefit's 2-RAF
// setActive(), focusPanelContent's retryFocus polling) can end up as
// `lastFocused`. restoreRegionFocus() then calls .focus() on it directly when
// the window regains focus — bypassing the whole panel-activation-request /
// WorkspaceDock-authority system — and because dockview treats a focusin
// landing in a panel's content as "make this panel active", that raw .focus()
// call can drag the active TAB along with it.
//
// Two variants:
//   1. Timing race — switches workspaces and calls the window-regain
//      simulation with no settle delay, maximizing the chance a deferred
//      retry from the workspace just left is still in flight when it fires.
//      10 rounds: this is inherently timing-sensitive, so more samples both
//      prove reproducibility pre-fix and later prove it's solid post-fix,
//      rather than one lucky/unlucky round reading as the whole story.
//   2. Deterministic — switches to an EMPTY workspace (no terminals/editors,
//      so nothing generates a fresh focusin there at all) and force-blurs, so
//      lastFocused is guaranteed to still be whatever it was in the
//      originating workspace. Isolates "does a stale cross-dock lastFocused
//      get restored at all" from timing luck. Diagnostic regardless of
//      pass/fail — report which variant actually reproduces; that tells us
//      whether the fix needs dock-scoping, focusGen-staleness, or both.
//
// Focus-sensitive: only runs with the window visible + frontmost (can't be
// guaranteed headless/CI — see client.foreground()). Skips otherwise.
//
// Requires the dev app running (`pnpm dev`); skips otherwise.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SiloAutomation } from "./client";

const silo = new SiloAutomation();
const available = await silo.available();
const canFocus = available && (await silo.foreground());

if (!available) {
  // eslint-disable-next-line no-console
  console.warn(
    "[window-focus-restore.it] no dev app reachable on :7878 — skipping. " +
      "Run `pnpm dev` to exercise this suite.",
  );
} else if (!canFocus) {
  // eslint-disable-next-line no-console
  console.warn(
    "[window-focus-restore.it] app window not foregrounded — skipping focus " +
      "assertions. Bring the Silo window to the front and keep it frontmost.",
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!canFocus)(
  "window regaining OS focus keeps the active tab",
  () => {
    let folderA: string;
    let folderB: string;
    let folderC: string;
    let priorActive: string | null;
    let wsA: string;
    let wsB: string;
    let wsC: string;
    let termA: string;
    let termB: string;

    beforeAll(async () => {
      priorActive = (await silo.listWorkspaces()).active;
      folderA = await mkdtemp(join(tmpdir(), "silo-it-wfr-a-"));
      folderB = await mkdtemp(join(tmpdir(), "silo-it-wfr-b-"));
      folderC = await mkdtemp(join(tmpdir(), "silo-it-wfr-c-"));
      wsA = (await silo.openWorkspace(folderA, "it-wfr-a")).id;
      wsB = (await silo.openWorkspace(folderB, "it-wfr-b")).id;
      // C stays empty on purpose — no terminals/editors, so switching to it
      // drives no fresh focusin anywhere (variant 2).
      wsC = (await silo.openWorkspace(folderC, "it-wfr-c")).id;

      await silo.activateWorkspace(wsA);
      termA = (await silo.openTerminal(folderA)).terminalId;

      await silo.activateWorkspace(wsB);
      termB = (await silo.openTerminal(folderB)).terminalId;
    }, 60000);

    afterAll(async () => {
      if (wsA) await silo.deleteWorkspace(wsA);
      if (wsB) await silo.deleteWorkspace(wsB);
      if (wsC) await silo.deleteWorkspace(wsC);
      if (priorActive) await silo.activateWorkspace(priorActive);
      await rm(folderA, { recursive: true, force: true });
      await rm(folderB, { recursive: true, force: true });
      await rm(folderC, { recursive: true, force: true });
    });

    it(
      "variant 1: window-regain right after a workspace switch doesn't restore the old workspace's tab",
      { timeout: 60000 },
      async () => {
        let failures = 0;
        for (let round = 0; round < 10; round++) {
          await silo.activateWorkspace(wsA);
          await silo.focusTerminal(termA);
          await sleep(300); // let A's focus fully settle — real lastFocused = A's terminal

          await silo.activateWorkspace(wsB);
          await silo.focusTerminal(termB);
          // No settle sleep here on purpose — call the regain-focus simulation
          // as close as possible to the switch, while B's own deferred focus
          // retries (and any straggler from A) may still be in flight.
          await silo.restoreRegionFocus();

          // Give every deferred actor its full budget, then check where things
          // actually settled — the assertion that matters, not the immediate
          // sample.
          await sleep(500);
          const finalPanel = await silo.activePanel();
          const finalEl = await silo.activeElement();
          if (
            finalPanel.panelId !== `terminal:${termB}` ||
            finalEl?.inActiveDockHost === false
          ) {
            failures++;
          }
        }
        expect(
          failures,
          `${failures}/10 rounds settled on the wrong workspace's tab after ` +
            `a window-regain race`,
        ).toBe(0);
      },
    );

    it(
      "variant 2: window-regain after switching to an empty workspace doesn't restore the backgrounded one",
      { timeout: 60000 },
      async () => {
        for (let round = 0; round < 4; round++) {
          await silo.activateWorkspace(wsA);
          await silo.focusTerminal(termA);
          await sleep(300);

          await silo.activateWorkspace(wsC); // empty — nothing to focus here
          await sleep(200);
          await silo.eval("document.activeElement?.blur()"); // simulate real OS blur

          const result = await silo.restoreRegionFocus();

          expect(
            result?.inActiveDockHost,
            `round ${round}: window-regain restored focus into backgrounded workspace A`,
          ).not.toBe(false);
        }
      },
    );
  },
);
