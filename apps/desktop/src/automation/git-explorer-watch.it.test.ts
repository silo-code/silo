// Integration test (Layer 2): drives the REAL running app over the automation
// RPC. Regression coverage for git-explorer's file watch after the `ctx.files`
// migration: the panel watches its workspace folder via `ctx.files.watch` and
// refreshes git status on disk changes (no longer piggybacking on a watch that
// the file explorer happened to own). Uses `showSidePanel` to wake the
// lazy-mounted git panel before asserting on its DOM.
//
// Requires the dev app running (`npm run app:dev`). When none is reachable the
// suite skips, so `npm test` stays green without it; `npm run test:it` expects
// a live app.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SiloAutomation } from "./client";

const silo = new SiloAutomation();
const available = await silo.available();

if (!available) {
  // eslint-disable-next-line no-console
  console.warn(
    "[git-explorer-watch.it] no dev app reachable on :7878 — skipping. " +
      "Run `npm run app:dev` to exercise this suite.",
  );
}

// Read the git panel's text content (scoped to .git-explorer-scroll so the file
// explorer tree can't produce a false positive).
const gitPanelText = (): Promise<string> =>
  silo
    .eval(`document.querySelector(".git-explorer-scroll")?.textContent ?? ""`)
    .then((v) => String(v ?? ""));

async function waitForPanel(
  predicate: (text: string) => boolean,
  { timeoutMs = 4000, intervalMs = 150 } = {},
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let text = await gitPanelText();
  while (!predicate(text)) {
    if (Date.now() > deadline) return text;
    await new Promise((r) => setTimeout(r, intervalMs));
    text = await gitPanelText();
  }
  return text;
}

describe.skipIf(!available)("git-explorer file watch", () => {
  let folder: string;
  let priorActive: string | null;
  let workspaceId: string;

  beforeAll(async () => {
    priorActive = (await silo.listWorkspaces()).active;
    folder = await mkdtemp(join(tmpdir(), "silo-it-gitwatch-"));
    const sh = (c: string) => execSync(c, { cwd: folder, stdio: "pipe" });
    sh("git init -q && git config user.email t@t && git config user.name t");
    await writeFile(join(folder, "tracked.txt"), "v1\n");
    sh("git add -A && git commit -qm init");
    workspaceId = (await silo.openWorkspace(folder, "it-gitwatch")).id;
    await silo.showSidePanel("git-explorer");
  });

  afterAll(async () => {
    if (workspaceId) await silo.deleteWorkspace(workspaceId);
    if (priorActive) await silo.activateWorkspace(priorActive);
    await rm(folder, { recursive: true, force: true });
  });

  it("mounts the git panel via showSidePanel", async () => {
    const mounted = await silo.eval(
      `!!document.querySelector(".git-explorer-scroll")`,
    );
    expect(mounted).toBe(true);
  });

  it("refreshes git status when an untracked file appears on disk", async () => {
    await writeFile(join(folder, "fresh-untracked.txt"), "x\n");
    const text = await waitForPanel((t) => t.includes("fresh-untracked.txt"));
    expect(text).toContain("fresh-untracked.txt");
  });

  it("refreshes git status when a tracked file is modified on disk", async () => {
    await writeFile(join(folder, "tracked.txt"), "v2-modified\n");
    const text = await waitForPanel((t) => t.includes("tracked.txt"));
    expect(text).toContain("tracked.txt");
  });
});
