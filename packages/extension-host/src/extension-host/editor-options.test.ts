// Text/diff equivalence test (Phase 3 seam test) + language detection. Encodes
// "text and diff are the SAME Monaco core, differing only where intended" so the
// two modes can never silently drift again (the bug this consolidation fixes:
// diff used to ignore editor settings and rewire its own options). Pure unit on
// the option builders — the "by construction" proof, no app required.

import { describe, it, expect } from "vitest";
import {
  languageFromPath,
  toTextEditorOptions,
  toDiffEditorOptions,
} from "./editor-options";
import { DEFAULT_EDITOR_SETTINGS, type EditorSettings } from "../state/types";

describe("languageFromPath", () => {
  it("maps known extensions and falls back to plaintext", () => {
    expect(languageFromPath("a.ts")).toBe("typescript");
    expect(languageFromPath("a.tsx")).toBe("typescript");
    expect(languageFromPath("a.md")).toBe("markdown");
    expect(languageFromPath("a.rs")).toBe("rust");
    expect(languageFromPath("a.toml")).toBe("ini");
    expect(languageFromPath("Makefile")).toBe("plaintext");
    expect(languageFromPath("a.unknownext")).toBe("plaintext");
  });
});

describe("text vs diff editor options (one core, two modes)", () => {
  const settings: EditorSettings = {
    ...DEFAULT_EDITOR_SETTINGS,
    tabSize: 4,
    wordWrap: true,
    minimap: true,
    renderWhitespace: "all",
    renderLineHighlight: "all",
  };
  const UI = 13;

  it("derives the same display/formatting options from editor settings in BOTH modes", () => {
    const text = toTextEditorOptions(settings, UI) as Record<string, unknown>;
    const diff = toDiffEditorOptions(settings, UI) as Record<string, unknown>;
    // Every settings-driven option is identical across modes — the proof they
    // share one core. (If diff regresses to ignoring settings, this fails.)
    for (const key of [
      "tabSize",
      "insertSpaces",
      "wordWrap",
      "minimap",
      "renderWhitespace",
      "renderLineHighlight",
      "smoothScrolling",
      "formatOnType",
      "formatOnPaste",
      "fontFamily",
      "fontSize", // text and diff render at the SAME size (converged)
      "scrollBeyondLastLine",
      "automaticLayout",
    ] as const) {
      expect(diff[key]).toEqual(text[key]);
    }
  });

  it("differs only in readOnly, side-by-side, and drop handling", () => {
    const text = toTextEditorOptions(settings, UI);
    const diff = toDiffEditorOptions(settings, UI);

    // Diff is read-only + side-by-side; text is editable and not.
    expect(diff.readOnly).toBe(true);
    expect(diff.renderSideBySide).toBe(true);
    expect(text.readOnly).toBeUndefined();

    // Font matches — the editor surface renders at uiFontSize + 0.5 in BOTH
    // modes (the old per-surface delta is gone; diff no longer shrinks).
    expect(text.fontSize).toBe(UI + 0.5);
    expect(diff.fontSize).toBe(UI + 0.5);

    // Drop-into-editor is disabled for the editable text editor only.
    expect(text.dropIntoEditor).toEqual({ enabled: false });
  });

  it("reflects the shipped defaults (minimap off, 2-space, whitespace on selection)", () => {
    const text = toTextEditorOptions(DEFAULT_EDITOR_SETTINGS, 12);
    expect(text).toMatchObject({
      tabSize: 2,
      insertSpaces: true,
      wordWrap: "off",
      minimap: { enabled: false },
      renderWhitespace: "selection",
      renderLineHighlight: "gutter",
      fontSize: 12.5,
    });
  });
});
