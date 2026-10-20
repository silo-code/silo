import { describe, expect, it } from "vitest";
import { codeBlockFacts, wrapsByDefault } from "./code-block";

/** The hast shape react-markdown hands a `pre` component override. */
function pre(text: string, language?: string) {
  return {
    type: "element",
    tagName: "pre",
    properties: {},
    children: [
      {
        type: "element",
        tagName: "code",
        properties:
          language === undefined ? {} : { className: [`language-${language}`] },
        children: [{ type: "text", value: text }],
      },
    ],
  };
}

describe("wrapsByDefault", () => {
  it("wraps a bare fence — an agent quoting prose", () => {
    expect(wrapsByDefault(undefined)).toBe(true);
  });

  it("wraps the fences that claim to hold plain text", () => {
    for (const lang of ["text", "txt", "plain", "plaintext", "markdown", "md"])
      expect(wrapsByDefault(lang)).toBe(true);
  });

  it("scrolls anything claiming a real language", () => {
    for (const lang of ["ts", "tsx", "bash", "sh", "json", "diff", "rust"])
      expect(wrapsByDefault(lang)).toBe(false);
  });
});

describe("codeBlockFacts", () => {
  it("reads the info string off the inner code element", () => {
    expect(codeBlockFacts(pre("const a = 1;", "ts")).language).toBe("ts");
  });

  it("lowercases the info string so TS and ts agree", () => {
    expect(codeBlockFacts(pre("x", "TS")).language).toBe("ts");
  });

  it("reports no language for a bare fence", () => {
    expect(codeBlockFacts(pre("hey Ilya, scoping the Q4 work")).language).toBe(
      undefined,
    );
  });

  it("accepts className as a space-separated string", () => {
    const node = {
      tagName: "pre",
      children: [
        {
          tagName: "code",
          properties: { className: "hljs language-bash" },
          children: [{ type: "text", value: "ls" }],
        },
      ],
    };
    expect(codeBlockFacts(node).language).toBe("bash");
  });

  it("ignores classes that are not a language tag", () => {
    const node = {
      tagName: "pre",
      children: [
        {
          tagName: "code",
          properties: { className: ["hljs", "language-"] },
          children: [{ type: "text", value: "x" }],
        },
      ],
    };
    expect(codeBlockFacts(node).language).toBe(undefined);
  });

  it("concatenates the fence's text across child nodes", () => {
    const node = {
      tagName: "pre",
      children: [
        {
          tagName: "code",
          properties: {},
          children: [
            { type: "text", value: "line one\n" },
            {
              type: "element",
              children: [{ type: "text", value: "line two" }],
            },
          ],
        },
      ],
    };
    expect(codeBlockFacts(node).text).toBe("line one\nline two");
  });

  it("drops the trailing newline the fence syntax adds", () => {
    expect(codeBlockFacts(pre("echo hi\n", "bash")).text).toBe("echo hi");
  });

  it("keeps a deliberate blank line in the middle", () => {
    expect(codeBlockFacts(pre("a\n\nb\n")).text).toBe("a\n\nb");
  });

  it("carries the wrap default alongside the text", () => {
    expect(codeBlockFacts(pre("some drafted prose")).wrapped).toBe(true);
    expect(codeBlockFacts(pre("const a = 1;", "ts")).wrapped).toBe(false);
  });

  it("survives a node it cannot read", () => {
    expect(codeBlockFacts(undefined)).toEqual({
      language: undefined,
      text: "",
      wrapped: true,
    });
    expect(codeBlockFacts("not a node").text).toBe("");
  });
});
