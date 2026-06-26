import { describe, it, expect } from "vitest";
import {
  effectiveFontFamily,
  FONT_STACK_WINDOWS,
  FONT_STACK_MAC,
  FONT_STACK_LINUX,
} from "./terminal-font";

describe("effectiveFontFamily", () => {
  describe("custom font set", () => {
    it("returns the custom font on any platform", () => {
      expect(effectiveFontFamily("JetBrains Mono", false, false)).toBe(
        "JetBrains Mono",
      );
      expect(effectiveFontFamily("JetBrains Mono", true, false)).toBe(
        "JetBrains Mono",
      );
      expect(effectiveFontFamily("JetBrains Mono", false, true)).toBe(
        "JetBrains Mono",
      );
    });

    it("trims whitespace from the font name before returning", () => {
      expect(effectiveFontFamily("  Fira Code  ", false, true)).toBe(
        "Fira Code",
      );
    });

    it("treats whitespace-only as empty and falls back to platform default", () => {
      expect(effectiveFontFamily("   ", false, true)).toBe(FONT_STACK_MAC);
    });
  });

  describe("platform defaults when fontFamily is empty", () => {
    it("returns the Windows stack on Windows", () => {
      expect(effectiveFontFamily("", true, false)).toBe(FONT_STACK_WINDOWS);
    });

    it("returns the Mac stack on Mac", () => {
      expect(effectiveFontFamily("", false, true)).toBe(FONT_STACK_MAC);
    });

    it("returns the Linux stack when neither Windows nor Mac", () => {
      expect(effectiveFontFamily("", false, false)).toBe(FONT_STACK_LINUX);
    });

    it("Windows takes priority if both flags are true (shouldn't happen in practice)", () => {
      expect(effectiveFontFamily("", true, true)).toBe(FONT_STACK_WINDOWS);
    });
  });
});
