import { describe, it, expect } from "vitest";
import { extensionIconFor, iconedExtensionIds } from "./extension-icons";

describe("extensionIconFor", () => {
  it("gives a bundled extension its own glyph", () => {
    expect(extensionIconFor("core.terminal")).not.toBeNull();
    expect(extensionIconFor("silo.git-explorer")).not.toBeNull();
  });

  it("has nothing for an extension the user installed themselves", () => {
    // The card falls back to the placeholder — third-party icons would need
    // the manifest/registry work this map exists to avoid.
    expect(extensionIconFor("acme.linter")).toBeNull();
  });

  it("has nothing for an unknown id rather than throwing", () => {
    expect(extensionIconFor("")).toBeNull();
    // A plain object's inherited keys must not read as icons.
    expect(extensionIconFor("toString")).toBeNull();
    expect(extensionIconFor("constructor")).toBeNull();
  });
});

describe("the bundled icon map", () => {
  it("only claims namespaced ids Silo actually ships", () => {
    for (const id of iconedExtensionIds()) {
      expect(id).toMatch(/^(core|silo)\./);
    }
  });

  it("gives each extension a distinct glyph", () => {
    // Two identical icons in one grid are worse than none — the point is to
    // tell the cards apart.
    const glyphs = iconedExtensionIds().map(
      (id) => extensionIconFor(id)?.glyph,
    );
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });

  it("tints from a closed palette, reused across related extensions", () => {
    const tints = iconedExtensionIds().map((id) => extensionIconFor(id)?.tint);
    for (const tint of tints) expect(tint).toMatch(/^#[0-9a-f]{6}$/);
    // Fewer distinct tints than extensions is the point: color carries family,
    // the glyph carries identity. A unique color per card reads as a bag of
    // stickers.
    expect(new Set(tints).size).toBeLessThan(tints.length);
  });

  it("puts every git surface on one tint and every file surface on another", () => {
    const tintOf = (id: string) => extensionIconFor(id)?.tint;
    expect(tintOf("silo.git")).toBe(tintOf("silo.git-explorer"));
    expect(tintOf("silo.file-explorer")).toBe(tintOf("silo.file-search"));
    expect(tintOf("silo.git")).not.toBe(tintOf("silo.file-explorer"));
  });
});
