// Characterization test (Phase 0 safety net): pins the settings → Monaco
// construction-options mapping `toMonacoOptions`. This is pure logic with no app
// dependency, so it runs in the `unit` project and is the regression oracle for
// the core.editor consolidation (Phase 3): when text + diff modes fold onto one
// shared Monaco core, editor settings must drive BOTH modes through exactly this
// mapping. If the translation here changes, the consolidation changed behavior —
// which this test makes impossible to do silently.
//
// Assert at the surviving contract (the settings → options function), not the
// component internals that are about to move.

import { describe, it, expect } from "vitest";
import { toMonacoOptions } from "./editor-settings";
import { DEFAULT_EDITOR_SETTINGS, type EditorSettings } from "./types";

describe("toMonacoOptions", () => {
  it("maps the shipped defaults to the expected Monaco options", () => {
    expect(toMonacoOptions(DEFAULT_EDITOR_SETTINGS)).toEqual({
      tabSize: 2,
      insertSpaces: true,
      wordWrap: "off",
      minimap: { enabled: false },
      renderWhitespace: "selection",
      renderLineHighlight: "gutter",
      smoothScrolling: true,
      formatOnType: false,
      formatOnPaste: false,
    });
  });

  it("translates the boolean wordWrap toggle to Monaco's on/off enum", () => {
    expect(
      toMonacoOptions({ ...DEFAULT_EDITOR_SETTINGS, wordWrap: true }),
    ).toMatchObject({ wordWrap: "on" });
    expect(
      toMonacoOptions({ ...DEFAULT_EDITOR_SETTINGS, wordWrap: false }),
    ).toMatchObject({ wordWrap: "off" });
  });

  it("wraps the minimap boolean in Monaco's { enabled } shape", () => {
    expect(
      toMonacoOptions({ ...DEFAULT_EDITOR_SETTINGS, minimap: true }),
    ).toMatchObject({ minimap: { enabled: true } });
  });

  it("passes the remaining fields through unchanged", () => {
    const custom: EditorSettings = {
      formatOnSave: true, // not a Monaco construction option — must NOT leak
      formatOnType: true,
      formatOnPaste: true,
      tabSize: 8,
      insertSpaces: false,
      wordWrap: true,
      minimap: true,
      renderWhitespace: "all",
      renderLineHighlight: "all",
      smoothScrolling: false,
    };
    expect(toMonacoOptions(custom)).toEqual({
      tabSize: 8,
      insertSpaces: false,
      wordWrap: "on",
      minimap: { enabled: true },
      renderWhitespace: "all",
      renderLineHighlight: "all",
      smoothScrolling: false,
      formatOnType: true,
      formatOnPaste: true,
    });
  });

  it("does not surface formatOnSave (it gates save, not the editor model)", () => {
    const opts = toMonacoOptions({
      ...DEFAULT_EDITOR_SETTINGS,
      formatOnSave: true,
    });
    expect(opts).not.toHaveProperty("formatOnSave");
  });
});
