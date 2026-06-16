// Integration test (Layer 2): drives the REAL running app over the automation
// RPC. Characterization guardrail for the file-watch -> editor-reload pipeline:
// when a file open in an editor changes ON DISK, the editor must reload to the
// new content. This is the user-visible behavior the upcoming `ctx.files`
// watch-ownership move (file-explorer-owned watch -> host-owned, ref-counted)
// must NOT regress — written against current behavior so it pins it.
//
// Also covers the deleted-file tab treatment: when the watched file is removed
// from disk, the tab gets the `deleted-title` class (VS Code's strikethrough
// tab) and clears it once the file reappears — see TextViewer/DockTab.
//
// Requires the dev app running (`npm run app:dev`). When none is reachable the
// suite skips, so `npm test` stays green without it; `npm run test:it` expects
// a live app.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { SiloAutomation } from "./client";

const silo = new SiloAutomation();
const available = await silo.available();

if (!available) {
  // eslint-disable-next-line no-console
  console.warn(
    "[file-watch-reload.it] no dev app reachable on :7878 — skipping. " +
      "Run `npm run app:dev` to exercise this suite.",
  );
}

// Poll an async predicate until it returns a truthy value or the deadline
// passes. File watching is inherently async (OS event -> backend -> webview ->
// re-read), so we wait for the reload rather than assert immediately.
async function waitFor<T>(
  fn: () => Promise<T>,
  predicate: (v: T) => boolean,
  { timeoutMs = 4000, intervalMs = 100 } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T = await fn();
  while (!predicate(last)) {
    if (Date.now() > deadline) return last;
    await new Promise((r) => setTimeout(r, intervalMs));
    last = await fn();
  }
  return last;
}

// The tab's class list, for the editor whose title contains `name` — ground
// truth for the deleted-file strikethrough (`deleted-title`, see CenterDock.css).
// Null if no matching tab is mounted.
function tabClassName(name: string): Promise<string | null> {
  return silo.eval<string | null>(
    `(() => {
      const spans = [...document.querySelectorAll(
        '[data-testid="dockview-dv-default-tab"] .dv-default-tab-content'
      )];
      const span = spans.find((s) => s.textContent.includes(${JSON.stringify(name)}));
      return span ? span.className : null;
    })()`,
  );
}

describe.skipIf(!available)("file-watch -> editor reload", () => {
  let folder: string;
  let filePath: string;
  let fileName: string;
  let priorActive: string | null;
  let workspaceId: string;

  beforeAll(async () => {
    priorActive = (await silo.listWorkspaces()).active;
    // Deliberately NOT realpath'd: macOS tmpdir() lives under /var -> /private/var
    // (a symlink). The reload must work through the symlinked path — the scoped
    // `ctx.files.watch` delivers by watch id, not by brittle path-string match,
    // so this also guards against regressing to path-equality reload.
    folder = await mkdtemp(join(tmpdir(), "silo-it-watch-"));
    filePath = join(folder, "note.txt");
    fileName = basename(filePath);
    await writeFile(filePath, "original\n");
    workspaceId = (await silo.openWorkspace(folder, "it-watch")).id;
    await silo.openFile(filePath);
  });

  afterAll(async () => {
    if (workspaceId) await silo.deleteWorkspace(workspaceId);
    if (priorActive) await silo.activateWorkspace(priorActive);
    await rm(folder, { recursive: true, force: true });
  });

  it("loads the file's original content into the editor", async () => {
    const model = await waitFor(
      () => silo.editorContent(fileName),
      (m) => m !== null,
    );
    expect(model?.value).toContain("original");
  });

  it("reloads the editor when the file changes on disk", async () => {
    await writeFile(filePath, "changed-on-disk\n");

    const model = await waitFor(
      () => silo.editorContent(fileName),
      (m) => !!m && m.value.includes("changed-on-disk"),
    );
    expect(model?.value).toContain("changed-on-disk");
    expect(model?.value).not.toContain("original");
  });

  it("marks the tab deleted when the file is removed from disk", async () => {
    await rm(filePath);

    const className = await waitFor(
      () => tabClassName(fileName),
      (c) => !!c?.includes("deleted-title"),
    );
    expect(className).toContain("deleted-title");

    // The buffer itself is untouched — still shows the last-known content,
    // not cleared out just because the file vanished.
    const model = await silo.editorContent(fileName);
    expect(model?.value).toContain("changed-on-disk");
  });

  it("clears the deleted mark once the file reappears on disk", async () => {
    await writeFile(filePath, "recreated\n");

    const className = await waitFor(
      () => tabClassName(fileName),
      (c) => !!c && !c.includes("deleted-title"),
    );
    expect(className).not.toContain("deleted-title");

    const model = await waitFor(
      () => silo.editorContent(fileName),
      (m) => !!m && m.value.includes("recreated"),
    );
    expect(model?.value).toContain("recreated");
  });
});
