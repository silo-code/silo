import { describe, it, expect, beforeEach } from "vitest";
import { menuAcceleratorForCommand } from "./menu-accelerator";
import {
  displayKey,
  effectiveKey,
  recordKeybindingDefault,
  setUserBindings,
} from "./keymap";

describe("menuAcceleratorForCommand", () => {
  beforeEach(() => {
    setUserBindings([]);
    recordKeybindingDefault("core.terminal.clear", "cmd+k");
  });

  it("returns the display label for a command's default key", () => {
    const key = effectiveKey("core.terminal.clear");
    expect(menuAcceleratorForCommand("core.terminal.clear")).toBe(
      key ? displayKey(key) : undefined,
    );
  });

  it("reflects a user override", () => {
    setUserBindings([{ command: "core.terminal.clear", key: "cmd+shift+k" }]);
    const key = effectiveKey("core.terminal.clear");
    expect(menuAcceleratorForCommand("core.terminal.clear")).toBe(
      key ? displayKey(key) : undefined,
    );
  });

  it("returns undefined when the command is unbound", () => {
    setUserBindings([{ command: "-core.terminal.clear", key: "" }]);
    expect(menuAcceleratorForCommand("core.terminal.clear")).toBeUndefined();
  });
});
