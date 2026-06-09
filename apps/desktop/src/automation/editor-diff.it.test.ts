// Integration characterization: pins the diff viewer's observable behavior now
// that the core.editor consolidation has folded diff into the shared editor
// surface as a *mode* (see ctx-domains.md → "The editor surface", and issue #4).
// Two things this suite locks:
//   1. Convergence — diff renders through the SAME settings-driven Monaco core as
//      text: same font size, same display options (it used to hardcode them and
//      render 0.5px smaller). A regression that re-forks the diff core fails here.
//   2. The unified editor-record lifecycle — a diff is an editor record with
//      `mode: "diff"`, so it shares the temporary/preview-tab behavior with text
//      editors: a preview diff occupies the single preview slot, the next preview
//      replaces it (same record reused), and opening it permanent promotes it.
//
// Visibility-independent: reads Monaco model content + resolved options, the
// editor-record model (via `listEditors`), and the git object store — never OS
// focus. Requires the dev app (`npm run app:dev`).

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
    "[editor-diff.it] no dev app reachable on :7878 — skipping. " +
      "Run `npm run app:dev` to exercise this suite.",
  );
}

describe.skipIf(!available)("diff viewer characterization", () => {
  let folder: string;
  let priorActive: string | null;
  let workspaceId: string;

  beforeAll(async () => {
    priorActive = (await silo.listWorkspaces()).active;
    folder = await mkdtemp(join(tmpdir(), "silo-it-diff-"));
    const sh = (c: string) => execSync(c, { cwd: folder, stdio: "pipe" });
    sh("git init -q && git config user.email t@t && git config user.name t");
    // Three committed files; main.ts drives the convergence tests, a.ts/b.ts the
    // preview-slot tests (kept distinct so they never collide with main.ts's
    // permanent diffs).
    await writeFile(join(folder, "main.ts"), "const v = 1;\n");
    await writeFile(join(folder, "a.ts"), "const a = 1;\n");
    await writeFile(join(folder, "b.ts"), "const b = 1;\n");
    sh("git add -A && git commit -qm v1");
    // Working-tree changes so HEAD ≠ working: the diffs have real content on
    // both sides.
    await writeFile(join(folder, "main.ts"), "const v = 2;\n// changed\n");
    await writeFile(join(folder, "a.ts"), "const a = 2;\n");
    await writeFile(join(folder, "b.ts"), "const b = 2;\n");
    workspaceId = (await silo.openWorkspace(folder, "it-diff")).id;
  });

  afterAll(async () => {
    if (workspaceId) await silo.deleteWorkspace(workspaceId);
    if (priorActive) await silo.activateWorkspace(priorActive);
    await rm(folder, { recursive: true, force: true });
  });

  it("renders HEAD on the original side and the working tree on the modified side", async () => {
    const { diffId } = await silo.openDiff({
      path: join(folder, "main.ts"),
      providerId: "silo.git",
      args: { mode: "workingTree" },
    });
    await expect
      .poll(async () => (await silo.editorContent(`${diffId}/original`))?.value)
      .toBe("const v = 1;\n");
    await expect
      .poll(async () => (await silo.editorContent(`${diffId}/modified`))?.value)
      .toBe("const v = 2;\n// changed\n");
  });

  it("is read-only on both sides", async () => {
    const { diffId } = await silo.openDiff({
      path: join(folder, "main.ts"),
      providerId: "silo.git",
      args: { mode: "workingTree" },
    });
    await expect
      .poll(
        async () => (await silo.editorOptions(`${diffId}/modified`))?.readOnly,
      )
      .toBe(true);
    const original = await silo.editorOptions(`${diffId}/original`);
    expect(original?.readOnly).toBe(true);
  });

  it("renders through the same settings-driven core as the text editor", async () => {
    // The heart of the consolidation: text and diff are one Monaco core in two
    // modes, so the diff's display options — font size included — must equal the
    // text editor's for the same file, differing ONLY where diff intends to
    // (read-only). Diff used to hardcode its options (ignoring editor settings)
    // and render 0.5px smaller; this asserts convergence against the LIVE text
    // editor rather than hardcoded defaults, so it holds whatever the app's
    // editor settings happen to be. A regression that re-forks the diff core
    // (different font, ignored wrap/minimap/whitespace) fails here.
    const { editorId } = await silo.openFile(join(folder, "main.ts"));
    await expect
      .poll(async () => (await silo.editorOptions(editorId))?.fontSize)
      .toBeGreaterThan(0);
    const text = await silo.editorOptions(editorId);

    const { diffId } = await silo.openDiff({
      path: join(folder, "main.ts"),
      providerId: "silo.git",
      args: { mode: "workingTree" },
    });
    await expect
      .poll(
        async () => (await silo.editorOptions(`${diffId}/modified`))?.fontSize,
      )
      .toBeGreaterThan(0);
    const diff = await silo.editorOptions(`${diffId}/modified`);

    // Shared, settings-driven display options match exactly.
    expect(diff!.fontSize).toBe(text!.fontSize);
    expect(diff!.language).toBe(text!.language);
    expect(diff!.tabSize).toBe(text!.tabSize);
    expect(diff!.insertSpaces).toBe(text!.insertSpaces);
    expect(diff!.wordWrap).toBe(text!.wordWrap);
    expect(diff!.minimap).toBe(text!.minimap);
    expect(diff!.renderWhitespace).toBe(text!.renderWhitespace);
    expect(diff!.renderLineHighlight).toBe(text!.renderLineHighlight);
    // The one intended divergence: diff is read-only, text is editable.
    expect(diff!.readOnly).toBe(true);
    expect(text!.readOnly).toBe(false);
  });

  // --- Unified editor-record lifecycle (issue #4) -------------------------
  // A diff is an editor record (`mode: "diff"`), so it gets the text editor's
  // temporary/preview-tab behavior for free. These pin the acceptance criteria.

  it("opens a preview diff as a temporary tab in the single preview slot", async () => {
    const { diffId, panelId } = await silo.openDiff({
      path: join(folder, "a.ts"),
      providerId: "silo.git",
      args: { mode: "workingTree" },
      preview: true,
    });
    // Diffs share the editor panel-id scheme — no separate `diff:` kind.
    expect(panelId).toBe(`editor:${diffId}`);

    await expect
      .poll(async () => (await silo.listEditors()).previewEditorId)
      .toBe(diffId);
    const rec = (await silo.listEditors()).editors.find((e) => e.id === diffId);
    expect(rec).toMatchObject({ mode: "diff", isPreview: true });
    expect(rec?.filePath?.endsWith("a.ts")).toBe(true);

    // It actually mounts and renders the diff content (a real preview tab).
    await expect
      .poll(async () => (await silo.editorContent(`${diffId}/modified`))?.value)
      .toBe("const a = 2;\n");
  });

  it("replaces the preview diff with the next single-click preview (same slot)", async () => {
    // a.ts is already the preview from the prior test. Opening b.ts as a preview
    // must REUSE that slot (same record id), not spawn a second tab.
    const first = (await silo.listEditors()).previewEditorId;
    expect(first).not.toBeNull();

    const { diffId: second } = await silo.openDiff({
      path: join(folder, "b.ts"),
      providerId: "silo.git",
      args: { mode: "workingTree" },
      preview: true,
    });
    expect(second).toBe(first); // the slot was reused, not duplicated

    await expect
      .poll(async () => {
        const list = await silo.listEditors();
        return list.editors.filter((e) => e.isPreview).length;
      })
      .toBe(1); // still exactly one preview tab
    const rec = (await silo.listEditors()).editors.find((e) => e.id === second);
    expect(rec?.filePath?.endsWith("b.ts")).toBe(true);
    // And the content followed the slot to b.ts.
    await expect
      .poll(async () => (await silo.editorContent(`${second}/modified`))?.value)
      .toBe("const b = 2;\n");
  });

  it("promotes the preview diff to permanent when opened non-preview", async () => {
    const previewId = (await silo.listEditors()).previewEditorId;
    expect(previewId).not.toBeNull();

    // Opening the same diff (b.ts) permanently promotes the existing preview
    // rather than creating a new tab — the openEditor promotion path.
    const { diffId } = await silo.openDiff({
      path: join(folder, "b.ts"),
      providerId: "silo.git",
      args: { mode: "workingTree" },
    });
    expect(diffId).toBe(previewId);

    await expect
      .poll(async () => (await silo.listEditors()).previewEditorId)
      .toBeNull();
    const rec = (await silo.listEditors()).editors.find((e) => e.id === diffId);
    expect(rec).toMatchObject({ mode: "diff", isPreview: false });
  });
});
