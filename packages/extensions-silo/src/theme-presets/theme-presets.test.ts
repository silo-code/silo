import { describe, it, expect, vi } from "vitest";
import type { ExtensionContext, ThemePreset } from "@silo-code/sdk";
import { extension } from "./index";

// Activate the extension against a minimal fake `ctx` that only captures
// theme.registerPreset — the one method it touches — and return the presets.
function activateAndCollect(): ThemePreset[] {
  const presets: ThemePreset[] = [];
  const ctx = {
    theme: {
      registerPreset: vi.fn((p: ThemePreset) => {
        presets.push(p);
        return { dispose: () => {} };
      }),
    },
  } as unknown as ExtensionContext;
  extension.activate(ctx);
  return presets;
}

describe("theme-presets extension", () => {
  it("registers the bundled presets through ctx.theme.registerPreset", () => {
    const ids = activateAndCollect().map((p) => p.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "tokyo-night",
        "solarized-light",
        "gruvbox-dark",
        "high-contrast-dark",
        "high-contrast-light",
        "solarized-dark",
      ]),
    );
  });

  it("registers presets in alphabetical order by name", () => {
    const names = activateAndCollect().map((p) => p.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("keeps High Contrast Dark on the dark base/color-scheme with only text tokens overridden", () => {
    const highContrastDark = activateAndCollect().find(
      (p) => p.id === "high-contrast-dark",
    );
    expect(highContrastDark).toBeDefined();
    expect(highContrastDark!.base).toBe("dark");
    expect(highContrastDark!.colorScheme).toBe("dark");
    expect(highContrastDark!.vars["--silo-color-bg"]).toBeUndefined();
    expect(highContrastDark!.vars["--silo-color-accent"]).toBeUndefined();
  });

  it("keeps High Contrast Light on the light base/color-scheme with only text tokens overridden", () => {
    const highContrastLight = activateAndCollect().find(
      (p) => p.id === "high-contrast-light",
    );
    expect(highContrastLight).toBeDefined();
    expect(highContrastLight!.base).toBe("light");
    expect(highContrastLight!.colorScheme).toBe("light");
    expect(highContrastLight!.vars["--silo-color-bg"]).toBeUndefined();
    expect(highContrastLight!.vars["--silo-color-accent"]).toBeUndefined();
  });

  it("gives Solarized Dark a dark base matching its light sibling's structure", () => {
    const solarizedDark = activateAndCollect().find(
      (p) => p.id === "solarized-dark",
    );
    expect(solarizedDark).toBeDefined();
    expect(solarizedDark!.base).toBe("dark");
    expect(solarizedDark!.colorScheme).toBe("dark");
    expect(solarizedDark!.vars["--silo-color-bg"]).toBe("#002b36");
  });

  it("gives Gruvbox Dark its own warm notify (toast) palette", () => {
    const gruvbox = activateAndCollect().find((p) => p.id === "gruvbox-dark");
    expect(gruvbox).toBeDefined();
    expect(gruvbox!.vars["--silo-notify-bg"]).toBe("#3a3634");
    expect(gruvbox!.vars["--silo-notify-text"]).toBe("#d5c4a1");
    expect(gruvbox!.vars["--silo-notify-text-hi"]).toBe("#ebdbb2");
  });

  it("uses well-formed hex values for every notify token it sets", () => {
    const hex = /^#[0-9a-fA-F]{3,8}$/;
    for (const preset of activateAndCollect()) {
      for (const key of [
        "--silo-notify-bg",
        "--silo-notify-text",
        "--silo-notify-text-hi",
      ] as const) {
        const value = preset.vars[key];
        if (value !== undefined) expect(value).toMatch(hex);
      }
    }
  });
});
