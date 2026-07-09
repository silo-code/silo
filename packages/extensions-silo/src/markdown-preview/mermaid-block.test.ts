import { describe, expect, it } from "vitest";
import { codeBlockLanguage, codeBlockText } from "./mermaid-block";

describe("codeBlockLanguage", () => {
  it("extracts the language from a language-xxx className", () => {
    expect(codeBlockLanguage("language-mermaid")).toBe("mermaid");
    expect(codeBlockLanguage("language-typescript")).toBe("typescript");
  });

  it("returns null for an inline code element (no className)", () => {
    expect(codeBlockLanguage(undefined)).toBeNull();
  });

  it("returns null when className doesn't match the language- prefix", () => {
    expect(codeBlockLanguage("some-other-class")).toBeNull();
  });

  it("picks the language token out of a multi-class string", () => {
    expect(codeBlockLanguage("hljs language-mermaid")).toBe("mermaid");
  });
});

describe("codeBlockText", () => {
  it("returns a plain string unchanged", () => {
    expect(codeBlockText("flowchart LR")).toBe("flowchart LR");
  });

  it("joins an array of string children", () => {
    expect(codeBlockText(["flowchart LR\n", "  A --> B"])).toBe(
      "flowchart LR\n  A --> B",
    );
  });

  it("flattens nested arrays", () => {
    expect(codeBlockText(["a", ["b", "c"]])).toBe("abc");
  });

  it("returns an empty string for non-text children", () => {
    expect(codeBlockText(null)).toBe("");
    expect(codeBlockText(undefined)).toBe("");
    expect(codeBlockText(42)).toBe("");
  });
});
