import { describe, it, expect, beforeEach } from "vitest";
import {
  normalizeKey,
  toTauriAccelerator,
  setUserBindings,
  effectiveKey,
  isRemoved,
  recordMenuDefault,
  clearMenuDefaults,
  recordKeybindingDefault,
  clearKeybindingDefaults,
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
});

describe("user bindings → effective key", () => {
  beforeEach(() => {
    setUserBindings([]); // reset module state between tests
    clearMenuDefaults();
    clearKeybindingDefaults();
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
});
