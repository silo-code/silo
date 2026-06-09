// Integration test (Layer 2): creating a new terminal must focus it.
//
// Regression guard for the bug where opening a terminal — via Cmd+T
// (`core.newTerminal`), the "New Terminal" menu, or the group "+" menu — adds
// the panel but leaves keyboard focus on whatever was focused before (usually
// the editor you were in), so you have to click the terminal before you can
// type. All those paths funnel through `addTerminal` + WorkspaceDock's mount
// effect, so driving the command exercises the same code the mouse paths hit.
//
// Requires the dev app running (`npm run app:dev`); skips otherwise.

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
    "[new-terminal-focus.it] no dev app reachable on :7878 — skipping. " +
      "Run `npm run app:dev` to exercise this suite.",
  );
} else if (!canFocus) {
  // eslint-disable-next-line no-console
  console.warn(
    "[new-terminal-focus.it] app window not foregrounded — skipping focus " +
      "assertions. Bring the Silo window to the front and keep it frontmost.",
  );
}

describe.skipIf(!canFocus)("new terminal takes focus", () => {
  let folder: string;
  let priorActive: string | null;
  let workspaceId: string;

  beforeAll(async () => {
    priorActive = (await silo.listWorkspaces()).active;
    folder = await mkdtemp(join(tmpdir(), "silo-it-term-"));
    await writeFile(join(folder, "readme.txt"), "hello\n");
    // Single-folder workspace so `core.newTerminal` resolves the folder without
    // a picker dialog (see pickWorkspaceFolder).
    workspaceId = (await silo.openWorkspace(folder, "it-term")).id;
  });

  afterAll(async () => {
    if (workspaceId) await silo.deleteWorkspace(workspaceId);
    if (priorActive) await silo.activateWorkspace(priorActive);
    await rm(folder, { recursive: true, force: true });
  });

  it(
    "focuses the terminal created by core.newTerminal, stealing focus from the editor",
    { timeout: 20000 },
    async () => {
      // Start with the editor focused — the realistic "I'm editing, then hit
      // Cmd+T" scenario. Confirm focus really is in the editor first.
      await silo.openFile(join(folder, "readme.txt"));
      await expect
        .poll(async () => (await silo.activeElement())?.inMonaco ?? false, {
          timeout: 3000,
          interval: 50,
        })
        .toBe(true);

      // Cmd+T equivalent.
      expect((await silo.exec("core.newTerminal")).ran).toBe(true);

      // The new terminal must end up with DOM keyboard focus: xterm parks focus
      // on its helper <textarea>. (Pre-fix this stays false — focus never leaves
      // the editor.) Terminal creation spawns a PTY, so allow a generous budget.
      await expect
        .poll(
          async () => {
            const el = await silo.activeElement();
            return {
              inXterm: el?.inXterm ?? false,
              isTextarea: el?.isTextarea ?? false,
            };
          },
          { timeout: 8000, interval: 50 },
        )
        .toEqual({ inXterm: true, isTextarea: true });
    },
  );
});
