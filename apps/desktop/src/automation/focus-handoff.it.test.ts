// Integration test (Layer 2): drives the REAL running app over the automation
// RPC — no mocks, real WKWebView + dockview + Monaco. Regression coverage for
// the tab-switch focus-handoff bug: switching between two editor tabs in one
// group must leave exactly ONE editor holding text focus (the active tab), so
// Monaco can't misroute keystrokes to the editor you switched away from.
//
// Requires the dev app running (`npm run app:dev`). When none is reachable the
// whole suite is skipped, so `npm test` stays green without it; `npm run
// test:it` is the command that expects a live app.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SiloAutomation } from "./client";

const silo = new SiloAutomation();
const available = await silo.available();
// Focus-sensitive: only runs with the window visible + frontmost (can't be
// guaranteed headless/CI — see client.foreground()). Skips otherwise.
const canFocus = available && (await silo.foreground());

if (!available) {
  // eslint-disable-next-line no-console
  console.warn(
    "[focus-handoff.it] no dev app reachable on :7878 — skipping. " +
      "Run `npm run app:dev` to exercise this suite.",
  );
} else if (!canFocus) {
  // eslint-disable-next-line no-console
  console.warn(
    "[focus-handoff.it] app window not foregrounded — skipping focus " +
      "assertions. Bring the Silo window to the front and keep it frontmost.",
  );
}

interface OpenedFile {
  editorId: string;
  panelId: string;
}

describe.skipIf(!canFocus)("tab-switch focus handoff", () => {
  let folder: string;
  let priorActive: string | null;
  let workspaceId: string;
  let alpha: OpenedFile;
  let bravo: OpenedFile;

  beforeAll(async () => {
    priorActive = (await silo.listWorkspaces()).active;
    folder = await mkdtemp(join(tmpdir(), "silo-it-focus-"));
    await writeFile(join(folder, "alpha.txt"), "alpha\n");
    await writeFile(join(folder, "bravo.txt"), "bravo\n");
    workspaceId = (await silo.openWorkspace(folder, "it-focus")).id;
    alpha = await silo.openFile(join(folder, "alpha.txt"));
    bravo = await silo.openFile(join(folder, "bravo.txt"));
  });

  afterAll(async () => {
    // Leave no trace. deleteWorkspace removes the entry AND switches the active
    // workspace away (so deleting the folder underneath can't corrupt the dock —
    // see docs/automation.md "teardown must assert, not assume"). Then restore
    // whatever was active before, and remove the sandbox folder.
    if (workspaceId) await silo.deleteWorkspace(workspaceId);
    if (priorActive) await silo.activateWorkspace(priorActive);
    await rm(folder, { recursive: true, force: true });
  });

  // After activating `active`, that editor must become the sole text-focused
  // editor AND own the live activeElement, while its sibling `other` holds
  // neither. Scoped to this test's two editors by their unique editorId (the
  // `editorsDetail` op is global, and basenames can collide across workspaces).
  //
  // Focus lands asynchronously (retryFocus runs across animation frames), so we
  // poll until it settles. The bug state — both editors claiming text focus —
  // is stable, so it never settles to the expected value and the poll times
  // out, failing the test. That's exactly the regression we're guarding.
  async function assertHandoff(active: OpenedFile, other: OpenedFile) {
    await silo.activatePanel(active.panelId);
    await expect
      .poll(
        async () => {
          const editors = await silo.editorsDetail();
          const find = (id: string) =>
            editors.find((e) => e.modelUri?.includes(id));
          const a = find(active.editorId);
          const o = find(other.editorId);
          return {
            activeHasFocus: a?.hasTextFocus ?? null,
            activeOwnsElement: a?.textareaIsActiveElement ?? null,
            otherHasFocus: o?.hasTextFocus ?? null,
          };
        },
        { timeout: 3000, interval: 50 },
      )
      .toEqual({
        activeHasFocus: true,
        activeOwnsElement: true,
        otherHasFocus: false,
      });
  }

  it("hands focus fully to the activated tab (alpha → bravo), repeatedly", async () => {
    for (let i = 0; i < 8; i++) {
      await assertHandoff(alpha, bravo);
      await assertHandoff(bravo, alpha);
    }
  });

  it("hands focus back when switching the other direction (bravo → alpha)", async () => {
    for (let i = 0; i < 5; i++) {
      await assertHandoff(bravo, alpha);
      await assertHandoff(alpha, bravo);
    }
  });
});
