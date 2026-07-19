import { describe, it, expect, beforeEach } from "vitest";
import {
  normalizeKey,
  toTauriAccelerator,
  setUserBindings,
  getUserBindings,
  effectiveKey,
  defaultKey,
  isRemoved,
  overrideKey,
  recordMenuDefault,
  clearMenuDefaults,
  beginMenuDefaultBatch,
  commitMenuDefaultBatch,
  recordKeybindingDefault,
  clearKeybindingDefaults,
  setKeybindingCaptureActive,
  isKeybindingCaptureActive,
  onKeymapChange,
} from "./keymap";

describe("normalizeKey", () => {
  it("lowercases, dedupes, and canonically orders modifiers", () => {
    expect(normalizeKey("CmdOrCtrl+Shift+S")).toBe("cmd+shift+s");
    expect(normalizeKey("shift+cmd+b")).toBe("cmd+shift+b"); // reordered
    expect(normalizeKey("Control+Alt+Delete")).toBe("ctrl+alt+delete");
  });

  it("maps aliases (option→alt, meta/super→cmd)", () => {
    expect(normalizeKey("option+a")).toBe("alt+a");
    expect(normalizeKey("meta+k")).toBe("cmd+k");
    expect(normalizeKey("super+k")).toBe("cmd+k");
  });
});

describe("toTauriAccelerator", () => {
  it("converts a normalized key to the Tauri accelerator form", () => {
    expect(toTauriAccelerator("cmd+shift+s")).toBe("CmdOrCtrl+Shift+S");
    expect(toTauriAccelerator("ctrl+alt+a")).toBe("Ctrl+Alt+A");
  });

  it("uppercases single-letter and function keys", () => {
    expect(toTauriAccelerator("cmd+b")).toBe("CmdOrCtrl+B");
    expect(toTauriAccelerator("f5")).toBe("F5");
  });

  it("passes punctuation keys through verbatim (panel-toggle brackets)", () => {
    expect(toTauriAccelerator("cmd+alt+[")).toBe("CmdOrCtrl+Alt+[");
    expect(toTauriAccelerator("cmd+alt+]")).toBe("CmdOrCtrl+Alt+]");
  });
});

describe("user bindings → effective key", () => {
  beforeEach(() => {
    setUserBindings([]); // reset module state between tests
    clearMenuDefaults();
    clearKeybindingDefaults();
    setKeybindingCaptureActive(false);
    // Abandon any half-open batch from a previous test.
    beginMenuDefaultBatch();
    commitMenuDefaultBatch();
  });

  it("override wins over the menu default", () => {
    recordMenuDefault("file.save", "CmdOrCtrl+S");
    expect(effectiveKey("file.save")).toBe("cmd+s"); // default
    setUserBindings([{ command: "file.save", key: "cmd+shift+s" }]);
    expect(effectiveKey("file.save")).toBe("cmd+shift+s"); // override
  });

  it("a leading '-' unbinds a command", () => {
    recordMenuDefault("file.save", "CmdOrCtrl+S");
    setUserBindings([{ command: "-file.save", key: "" }]);
    expect(isRemoved("file.save")).toBe(true);
    expect(effectiveKey("file.save")).toBeUndefined();
  });

  it("surfaces a registerKeybinding default (no menu item) as the effective key", () => {
    recordKeybindingDefault("workspace.cycleForward", "cmd+`");
    expect(effectiveKey("workspace.cycleForward")).toBe("cmd+`");
    // An override still wins over a registry-declared default.
    setUserBindings([{ command: "workspace.cycleForward", key: "cmd+alt+`" }]);
    expect(effectiveKey("workspace.cycleForward")).toBe("cmd+alt+`");
  });

  it("prefers a menu default over a keybinding default for the same command", () => {
    recordMenuDefault("file.save", "CmdOrCtrl+S");
    recordKeybindingDefault("file.save", "cmd+k");
    expect(effectiveKey("file.save")).toBe("cmd+s");
  });

  it("ignores malformed binding entries", () => {
    // @ts-expect-error intentionally malformed
    setUserBindings([{ command: 123 }, null, { key: "cmd+x" }]);
    expect(effectiveKey("anything")).toBeUndefined();
  });

  it("defaultKey ignores overrides and unbinds", () => {
    recordMenuDefault("file.save", "CmdOrCtrl+S");
    setUserBindings([{ command: "file.save", key: "cmd+k" }]);
    expect(defaultKey("file.save")).toBe("cmd+s");
    expect(overrideKey("file.save")).toBe("cmd+k");
    setUserBindings([{ command: "-file.save", key: "" }]);
    expect(defaultKey("file.save")).toBe("cmd+s");
    expect(effectiveKey("file.save")).toBeUndefined();
  });

  it("getUserBindings round-trips overrides and unbinds in sorted order", () => {
    setUserBindings([
      { command: "z.cmd", key: "cmd+z" },
      { command: "-a.cmd", key: "" },
      { command: "b.cmd", key: "cmd+b" },
    ]);
    expect(getUserBindings()).toEqual([
      { command: "b.cmd", key: "cmd+b" },
      { command: "z.cmd", key: "cmd+z" },
      { command: "-a.cmd", key: "" },
    ]);
  });

  it("tracks keybinding capture active flag", () => {
    expect(isKeybindingCaptureActive()).toBe(false);
    setKeybindingCaptureActive(true);
    expect(isKeybindingCaptureActive()).toBe(true);
    setKeybindingCaptureActive(false);
    expect(isKeybindingCaptureActive()).toBe(false);
  });

  it("menu-default batches keep the live map intact until commit", () => {
    recordMenuDefault("file.save", "CmdOrCtrl+S");
    expect(effectiveKey("file.save")).toBe("cmd+s");

    beginMenuDefaultBatch();
    // Live map still has the old default while the batch is open.
    expect(effectiveKey("file.save")).toBe("cmd+s");
    recordMenuDefault("file.save", "CmdOrCtrl+S");
    recordMenuDefault("file.saveAs", "CmdOrCtrl+Shift+S");
    // Staged keys are not live yet.
    expect(effectiveKey("file.saveAs")).toBeUndefined();

    commitMenuDefaultBatch();
    expect(effectiveKey("file.save")).toBe("cmd+s");
    expect(effectiveKey("file.saveAs")).toBe("cmd+shift+s");
  });

  it("commitMenuDefaultBatch drops defaults that were not re-recorded", () => {
    recordMenuDefault("file.save", "CmdOrCtrl+S");
    recordMenuDefault("file.gone", "CmdOrCtrl+G");
    beginMenuDefaultBatch();
    recordMenuDefault("file.save", "CmdOrCtrl+S");
    commitMenuDefaultBatch();
    expect(effectiveKey("file.save")).toBe("cmd+s");
    expect(effectiveKey("file.gone")).toBeUndefined();
  });

  it("commitMenuDefaultBatch does not emit (avoids syncMenu feedback loop)", () => {
    let emissions = 0;
    const sub = onKeymapChange(() => {
      emissions++;
    });
    beginMenuDefaultBatch();
    recordMenuDefault("file.save", "CmdOrCtrl+S");
    commitMenuDefaultBatch();
    expect(emissions).toBe(0);
    setUserBindings([{ command: "file.save", key: "cmd+k" }]);
    expect(emissions).toBe(1);
    sub.dispose();
  });
});
