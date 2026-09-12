import { describe, it, expect } from "vitest";
import {
  chatExecPreview,
  formatArgs,
  matchesChatSuggestion,
  parseArgs,
  suggestChatLaunch,
} from "./chat-launch-model";

describe("parseArgs", () => {
  it("splits on whitespace", () => {
    expect(parseArgs("acp --verbose")).toEqual(["acp", "--verbose"]);
  });

  it("collapses runs of whitespace and trims", () => {
    expect(parseArgs("  a \t b  ")).toEqual(["a", "b"]);
  });

  it("returns nothing for an empty or blank field", () => {
    expect(parseArgs("")).toEqual([]);
    expect(parseArgs("   ")).toEqual([]);
  });

  it("keeps a quoted argument together", () => {
    expect(parseArgs(`--config "my file.json"`)).toEqual([
      "--config",
      "my file.json",
    ]);
    expect(parseArgs("--config 'my file.json'")).toEqual([
      "--config",
      "my file.json",
    ]);
  });

  it("treats an empty quoted token as an argument", () => {
    expect(parseArgs('a "" b')).toEqual(["a", "", "b"]);
  });

  it("escapes with a backslash", () => {
    expect(parseArgs("a\\ b")).toEqual(["a b"]);
    expect(parseArgs('say \\"hi\\"')).toEqual(["say", '"hi"']);
  });

  it("does not expand anything — this is argv, not a shell", () => {
    expect(parseArgs("$HOME `whoami` a|b a>b *")).toEqual([
      "$HOME",
      "`whoami`",
      "a|b",
      "a>b",
      "*",
    ]);
  });

  it("tolerates an unterminated quote rather than throwing", () => {
    expect(parseArgs('--x "unclosed')).toEqual(["--x", "unclosed"]);
  });
});

describe("formatArgs", () => {
  it("leaves plain arguments bare", () => {
    expect(formatArgs(["acp", "--verbose"])).toBe("acp --verbose");
  });

  it("quotes an argument containing a space", () => {
    expect(formatArgs(["--config", "my file.json"])).toBe(
      '--config "my file.json"',
    );
  });

  it("renders an empty argument visibly", () => {
    expect(formatArgs([""])).toBe('""');
  });

  it("round-trips through parseArgs", () => {
    for (const args of [
      ["acp"],
      ["--config", "my file.json"],
      ["a b", "c'd", 'e"f', "g\\h", ""],
      ["$HOME", "*"],
    ]) {
      expect(parseArgs(formatArgs(args))).toEqual(args);
    }
  });
});

describe("chatExecPreview", () => {
  it("shows the command and its argv", () => {
    expect(chatExecPreview("cursor-agent", ["acp"])).toBe("cursor-agent acp");
  });

  it("is empty until there is a command", () => {
    expect(chatExecPreview("  ", ["acp"])).toBe("");
  });

  it("quotes a token with a space so the preview is unambiguous", () => {
    expect(chatExecPreview("npx", ["-y", "a b"])).toBe('npx -y "a b"');
  });
});

describe("suggestChatLaunch", () => {
  it("offers the verified command and args for a built-in ACP agent", () => {
    expect(suggestChatLaunch("cursor")).toEqual({
      kind: "builtin",
      command: "cursor-agent",
      args: ["acp"],
    });
  });

  it("names the adapter without guessing a command for an adapter agent", () => {
    expect(suggestChatLaunch("claude")).toEqual({
      kind: "adapter",
      adapter: "claude-agent-acp",
    });
  });

  it("reports no ACP path for an agent that has none", () => {
    expect(suggestChatLaunch("grok")).toEqual({ kind: "none" });
  });

  it("distinguishes “no agent chosen” from “agent has no path”", () => {
    expect(suggestChatLaunch(undefined)).toBeUndefined();
    expect(suggestChatLaunch("not-an-agent")).toBeUndefined();
  });
});

describe("matchesChatSuggestion", () => {
  const cursor = suggestChatLaunch("cursor");

  it("matches the verified invocation", () => {
    expect(matchesChatSuggestion("cursor-agent", ["acp"], cursor)).toBe(true);
    expect(matchesChatSuggestion("  cursor-agent  ", ["acp"], cursor)).toBe(
      true,
    );
  });

  it("does not match the wrong binary — the bug that saved bare `cursor`", () => {
    expect(matchesChatSuggestion("cursor", ["acp"], cursor)).toBe(false);
  });

  it("does not match a missing or extra argument", () => {
    expect(matchesChatSuggestion("cursor-agent", [], cursor)).toBe(false);
    expect(matchesChatSuggestion("cursor-agent", ["acp", "-v"], cursor)).toBe(
      false,
    );
  });

  it("never matches when there is no built-in suggestion to compare against", () => {
    expect(
      matchesChatSuggestion("npx", ["x"], suggestChatLaunch("claude")),
    ).toBe(false);
    expect(matchesChatSuggestion("x", [], suggestChatLaunch("grok"))).toBe(
      false,
    );
    expect(matchesChatSuggestion("x", [], undefined)).toBe(false);
  });
});
