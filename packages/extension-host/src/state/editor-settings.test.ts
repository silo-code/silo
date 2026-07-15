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

import { describe, it, expect, beforeEach } from "vitest";
import {
  toMonacoOptions,
  mergeEditorSettings,
  toggleEditorViewOption,
} from "./editor-settings";
import { getEditorSettingOverride } from "./workspaces";
import { store } from "./store";
import {
  DEFAULT_EDITOR_SETTINGS,
  type EditorSettings,
  type WorkspaceInternal,
} from "./types";

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

describe("mergeEditorSettings", () => {
  it("falls through to the base when no override is given", () => {
    expect(mergeEditorSettings(DEFAULT_EDITOR_SETTINGS, undefined)).toEqual(
      DEFAULT_EDITOR_SETTINGS,
    );
  });

  it("overlays only the overridden keys, leaving the rest of the base untouched", () => {
    const merged = mergeEditorSettings(DEFAULT_EDITOR_SETTINGS, {
      wordWrap: true,
    });
    expect(merged.wordWrap).toBe(true);
    expect(merged.minimap).toBe(DEFAULT_EDITOR_SETTINGS.minimap);
    expect(merged.tabSize).toBe(DEFAULT_EDITOR_SETTINGS.tabSize);
  });

  it("overlays both overridden keys at once", () => {
    const merged = mergeEditorSettings(DEFAULT_EDITOR_SETTINGS, {
      wordWrap: true,
      minimap: true,
    });
    expect(merged.wordWrap).toBe(true);
    expect(merged.minimap).toBe(true);
  });
});

describe("toggleEditorViewOption", () => {
  function makeWorkspace(id: string): WorkspaceInternal {
    return {
      id,
      name: id,
      folder: `/ws/${id}`,
      createdAt: "",
      lastOpenedAt: "",
      terminals: [],
      editors: [],
      dockLayout: null,
      previewEditorId: null,
    };
  }

  beforeEach(() => {
    store.workspaces = { w: makeWorkspace("w") };
    store.editorSettings = { ...DEFAULT_EDITOR_SETTINGS };
  });

  it("flips the effective (global) value into an explicit override", () => {
    expect(store.editorSettings.wordWrap).toBe(false);
    toggleEditorViewOption("w", "ed1", "wordWrap");
    expect(getEditorSettingOverride("w", "ed1")).toEqual({ wordWrap: true });
  });

  it("flips relative to an existing override, not the global default", () => {
    toggleEditorViewOption("w", "ed1", "wordWrap"); // false -> true
    toggleEditorViewOption("w", "ed1", "wordWrap"); // true -> false
    expect(getEditorSettingOverride("w", "ed1")).toEqual({ wordWrap: false });
  });

  it("keeps overrides independent per key", () => {
    toggleEditorViewOption("w", "ed1", "wordWrap");
    toggleEditorViewOption("w", "ed1", "minimap");
    expect(getEditorSettingOverride("w", "ed1")).toEqual({
      wordWrap: true,
      minimap: true,
    });
  });

  it("keeps overrides independent per editor id", () => {
    toggleEditorViewOption("w", "ed1", "wordWrap");
    expect(getEditorSettingOverride("w", "ed2")).toEqual({});
  });
});
