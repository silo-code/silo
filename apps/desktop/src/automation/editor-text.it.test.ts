// Integration characterization (Phase 0 safety net): pins the text-editor's
// observable behavior before the core.editor consolidation (Phase 3) folds the
// text + diff + settings panels onto one shared Monaco core. Asserts at the
// surviving contract — open shows content, the right language is detected, the
// shipped editor settings reach the editor, and edit → save round-trips to disk
// — never on TextViewer's internals (which are about to move).
//
// Visibility-independent on purpose: it reads Monaco model/option state and the
// file on disk, never OS focus, so it runs green even when the app window isn't
// frontmost (unlike the focus-handoff suite). Edits are driven through
// `setEditorValue` (a model.setValue, the same change path as typing) rather
// than synthetic keystrokes, which would need the window foregrounded.
//
// Requires the dev app (`npm run app:dev`); skips when none is reachable.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SiloAutomation } from "./client";

const silo = new SiloAutomation();
const available = await silo.available();

if (!available) {
  // eslint-disable-next-line no-console
  console.warn(
    "[editor-text.it] no dev app reachable on :7878 — skipping. " +
      "Run `npm run app:dev` to exercise this suite.",
  );
}

describe.skipIf(!available)("text editor characterization", () => {
  let folder: string;
  let priorActive: string | null;
  let workspaceId: string;

  beforeAll(async () => {
    priorActive = (await silo.listWorkspaces()).active;
    folder = await mkdtemp(join(tmpdir(), "silo-it-editor-"));
    await writeFile(join(folder, "main.ts"), "const greeting = 1;\n");
    await writeFile(join(folder, "notes.md"), "# Notes\n");
    await writeFile(join(folder, "lib.rs"), "fn main() {}\n");
    await writeFile(join(folder, "data.unknownext"), "raw\n");
    workspaceId = (await silo.openWorkspace(folder, "it-editor")).id;
  });

  afterAll(async () => {
    if (workspaceId) await silo.deleteWorkspace(workspaceId);
    if (priorActive) await silo.activateWorkspace(priorActive);
    await rm(folder, { recursive: true, force: true });
  });

  it("opens a file and shows its content in a Monaco model", async () => {
    const { editorId } = await silo.openFile(join(folder, "main.ts"));
    await expect
      .poll(async () => (await silo.editorContent(editorId))?.value)
      .toBe("const greeting = 1;\n");
  });

  it("detects the editor language from the file extension", async () => {
    const cases: [string, string][] = [
      ["main.ts", "typescript"],
      ["notes.md", "markdown"],
      ["lib.rs", "rust"],
      ["data.unknownext", "plaintext"],
    ];
    for (const [name, expected] of cases) {
      const { editorId } = await silo.openFile(join(folder, name));
      await expect
        .poll(async () => (await silo.editorOptions(editorId))?.language)
        .toBe(expected);
    }
  });

  it("applies the shipped editor settings to the text editor", async () => {
    const { editorId } = await silo.openFile(join(folder, "main.ts"));
    await expect
      .poll(async () => (await silo.editorOptions(editorId))?.language, {
        timeout: 4000,
      })
      .toBe("typescript");
    const opts = await silo.editorOptions(editorId);
    // The shipped DEFAULT_EDITOR_SETTINGS reaching the live text editor. These
    // are the values core.editor must keep driving once text + diff share a core.
    expect(opts).toMatchObject({
      language: "typescript",
      tabSize: 2,
      insertSpaces: true,
      wordWrap: "off",
      minimap: false,
      renderWhitespace: "selection",
      renderLineHighlight: "gutter",
      readOnly: false,
    });
    // Text mode renders at uiFontSize + 0.5 (see TextViewer). The exact px
    // depends on the app's uiFontSize; the text-vs-diff 0.5 delta is pinned in
    // editor-diff.it.test.ts. Here we just lock that text mode is editable and
    // has a real font size.
    expect(opts!.fontSize).toBeGreaterThan(0);
  });

  it("round-trips an edit to disk on save (core.save)", async () => {
    const path = join(folder, "main.ts");
    const { editorId, panelId } = await silo.openFile(path);
    await silo.activatePanel(panelId); // core.save targets the active editor

    const edited = "const greeting = 42;\n// edited by characterization test\n";
    const res = await silo.setEditorValue(editorId, edited);
    expect(res?.valueLength).toBe(edited.length);

    // The edit is live in the model immediately…
    await expect
      .poll(async () => (await silo.editorContent(editorId))?.value)
      .toBe(edited);

    // …and reaches disk only after save.
    await silo.exec("core.save");
    await expect
      .poll(async () => await readFile(path, "utf8"), { timeout: 4000 })
      .toBe(edited);
  });
});
