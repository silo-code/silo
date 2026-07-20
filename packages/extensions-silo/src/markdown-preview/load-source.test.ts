import { describe, it, expect, vi } from "vitest";
import { loadMarkdownSource } from "./load-source";

describe("loadMarkdownSource", () => {
  it("prefers the live editor buffer over disk", async () => {
    const readText = vi.fn(async () => "from disk");
    const result = await loadMarkdownSource({
      editorId: "e1",
      filePath: "/ws/notes.md",
      getText: async () => "# unsaved",
      readText,
    });
    expect(result).toEqual({ ok: true, content: "# unsaved" });
    expect(readText).not.toHaveBeenCalled();
  });

  it("falls back to disk when there is no live buffer", async () => {
    const result = await loadMarkdownSource({
      editorId: "e1",
      filePath: "/ws/notes.md",
      getText: async () => undefined,
      readText: async () => "# on disk",
    });
    expect(result).toEqual({ ok: true, content: "# on disk" });
  });

  it("errors when there is no buffer and no file path (untitled)", async () => {
    const result = await loadMarkdownSource({
      editorId: "e1",
      filePath: null,
      getText: async () => undefined,
      readText: async () => {
        throw new Error("should not read");
      },
    });
    expect(result).toEqual({
      ok: false,
      error: "Markdown preview requires a file path.",
    });
  });

  it("surfaces a disk read failure", async () => {
    const result = await loadMarkdownSource({
      editorId: "e1",
      filePath: "/ws/missing.md",
      getText: async () => undefined,
      readText: async () => {
        throw new Error("ENOENT");
      },
    });
    expect(result).toEqual({ ok: false, error: "Error: ENOENT" });
  });

  it("uses an empty live buffer (new file, unsaved) instead of disk", async () => {
    // Empty string is still a defined buffer — e.g. user cleared the file.
    // Distinguishes from `undefined` (no text-backed provider / retention).
    const readText = vi.fn(async () => "stale disk");
    const result = await loadMarkdownSource({
      editorId: "e1",
      filePath: "/ws/new.md",
      getText: async () => "",
      readText,
    });
    expect(result).toEqual({ ok: true, content: "" });
    expect(readText).not.toHaveBeenCalled();
  });
});
