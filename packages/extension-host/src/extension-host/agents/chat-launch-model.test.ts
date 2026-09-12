import { describe, it, expect } from "vitest";
import {
  chatAgentForLaunch,
  chatExecPreview,
  chatLaunchForAgent,
  formatArgs,
  parseArgs,
} from "./chat-launch-model";
import { agentById } from "./agent-catalog";

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

describe("chatLaunchForAgent", () => {
  it("composes the verified command and args for a built-in ACP agent", () => {
    expect(chatLaunchForAgent("cursor")).toEqual({
      command: "cursor-agent",
      args: ["acp"],
    });
    expect(chatLaunchForAgent("copilot")).toEqual({
      command: "copilot",
      args: ["--acp"],
    });
  });

  it("composes a pinned npx invocation for an adapter agent", () => {
    expect(chatLaunchForAgent("claude")).toEqual({
      command: "npx",
      args: ["-y", "@agentclientprotocol/claude-agent-acp@0.75.1"],
    });
    expect(chatLaunchForAgent("pi")).toEqual({
      command: "npx",
      args: ["-y", "pi-acp@0.0.33"],
    });
  });

  it("composes from the catalog rather than a literal, for every adapter", () => {
    for (const id of ["claude", "codex", "pi"]) {
      const acp = agentById(id)?.acpLaunch;
      if (acp?.kind !== "adapter") throw new Error(`${id} is not an adapter`);
      expect(chatLaunchForAgent(id)?.args).toEqual([
        "-y",
        `${acp.package}@${acp.version}`,
      ]);
    }
  });

  // The whole point of Session 3.6: an agent Silo cannot launch as a Chat
  // session is left out of the picker, not offered with a warning attached.
  it("is undefined for an agent with no verified ACP path", () => {
    expect(chatLaunchForAgent("grok")).toBeUndefined();
    expect(chatLaunchForAgent("omp")).toBeUndefined();
  });

  it("is undefined for no agent and for an unknown id", () => {
    expect(chatLaunchForAgent(undefined)).toBeUndefined();
    expect(chatLaunchForAgent("")).toBeUndefined();
    expect(chatLaunchForAgent("not-an-agent")).toBeUndefined();
  });
});

describe("chatAgentForLaunch", () => {
  it("recognises a launch it composed itself", () => {
    for (const id of [
      "cursor",
      "opencode",
      "copilot",
      "claude",
      "codex",
      "pi",
    ]) {
      const launch = chatLaunchForAgent(id);
      if (!launch) throw new Error(`${id} has no chat launch`);
      expect(chatAgentForLaunch(launch.command, launch.args)).toBe(id);
    }
  });

  // A catalog version bump must not silently reclassify every saved profile as
  // Custom — the package identifies the agent, the version is the user's pin.
  it("recognises an adapter at a different pinned version", () => {
    expect(
      chatAgentForLaunch("npx", [
        "-y",
        "@agentclientprotocol/claude-agent-acp@0.60.0",
      ]),
    ).toBe("claude");
    expect(chatAgentForLaunch("npx", ["-y", "pi-acp@0.0.1"])).toBe("pi");
  });

  it("recognises an adapter with no version at all", () => {
    expect(
      chatAgentForLaunch("npx", ["-y", "@agentclientprotocol/codex-acp"]),
    ).toBe("codex");
  });

  it("does not confuse a same-named fork from another vendor", () => {
    expect(
      chatAgentForLaunch("npx", ["-y", "@automatalabs/pi-acp@0.7.0"]),
    ).toBe(undefined);
  });

  it("does not match the wrong binary — the bug that saved bare `cursor`", () => {
    expect(chatAgentForLaunch("cursor", ["acp"])).toBeUndefined();
  });

  it("does not match a missing or extra argument on a builtin", () => {
    expect(chatAgentForLaunch("cursor-agent", [])).toBeUndefined();
    expect(chatAgentForLaunch("cursor-agent", ["acp", "-v"])).toBeUndefined();
  });

  it("ignores surrounding whitespace on the command", () => {
    expect(chatAgentForLaunch("  cursor-agent  ", ["acp"])).toBe("cursor");
  });

  // Dave's `claude-personal` profile — a zsh alias that can never work under
  // `exec`. It must present as Custom… so the editor shows it honestly instead
  // of quietly replacing it with the catalog's answer.
  it("returns undefined for a launch it did not compose", () => {
    expect(chatAgentForLaunch("claude-personal", [])).toBeUndefined();
    expect(
      chatAgentForLaunch("/usr/local/bin/my-acp", ["serve"]),
    ).toBeUndefined();
    expect(chatAgentForLaunch("", [])).toBeUndefined();
  });
});
