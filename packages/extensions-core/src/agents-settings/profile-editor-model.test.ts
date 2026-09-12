import { describe, it, expect } from "vitest";
import type { AgentProfile } from "@silo-code/extension-host/internal";
import {
  editorStateFromProfile,
  launchFromEditorState,
} from "./profile-editor-model";

const terminalProfile: AgentProfile = {
  id: "claude-work",
  label: "Claude (work)",
  launch: {
    interface: "terminal",
    command: "claude-work",
    configDir: "/Users/d/.claude-work",
  },
  assumedAgentId: "claude",
};

const chatProfile: AgentProfile = {
  id: "cursor-chat",
  label: "Cursor (chat)",
  launch: { interface: "chat", command: "cursor-agent", args: ["acp"] },
  assumedAgentId: "cursor",
};

describe("editorStateFromProfile", () => {
  it("is empty and Terminal-armed for a new profile", () => {
    expect(editorStateFromProfile()).toEqual({
      label: "",
      id: "",
      idEdited: false,
      interfaceKind: "terminal",
      terminalCommand: "",
      chatCommand: "",
      args: "",
      agentOverride: "",
      configDir: "",
      chatLaunchEdited: false,
    });
  });

  it("loads a Terminal profile into the Terminal arm", () => {
    expect(editorStateFromProfile(terminalProfile)).toMatchObject({
      interfaceKind: "terminal",
      terminalCommand: "claude-work",
      // Never leaks into the Chat arm: a shell alias is not an executable.
      chatCommand: "",
      configDir: "/Users/d/.claude-work",
      agentOverride: "claude",
      args: "",
    });
  });

  it("loads a Chat profile into the Chat arm, argv rendered for the field", () => {
    expect(editorStateFromProfile(chatProfile)).toMatchObject({
      interfaceKind: "chat",
      chatCommand: "cursor-agent",
      terminalCommand: "",
      args: "acp",
      configDir: "",
    });
  });

  it("treats an existing Chat profile's line as user-authored", () => {
    // Otherwise reopening the profile would let the catalog suggestion
    // overwrite whatever the user actually saved.
    expect(editorStateFromProfile(chatProfile).chatLaunchEdited).toBe(true);
    expect(editorStateFromProfile(terminalProfile).chatLaunchEdited).toBe(
      false,
    );
  });

  it("quotes an argv entry containing a space for the text field", () => {
    const state = editorStateFromProfile({
      launch: {
        interface: "chat",
        command: "npx",
        args: ["-y", "some pkg@1.0.0"],
      },
    });
    expect(state.args).toBe('-y "some pkg@1.0.0"');
  });
});

describe("launchFromEditorState", () => {
  it("writes the Terminal arm with its config directory", () => {
    expect(
      launchFromEditorState(
        {
          interfaceKind: "terminal",
          terminalCommand: " claude-work ",
          chatCommand: "",
          args: "",
        },
        "/Users/d/.claude-work",
      ),
    ).toEqual({
      interface: "terminal",
      command: "claude-work",
      configDir: "/Users/d/.claude-work",
    });
  });

  it("omits configDir entirely rather than storing an empty one", () => {
    expect(
      launchFromEditorState(
        {
          interfaceKind: "terminal",
          terminalCommand: "claude",
          chatCommand: "",
          args: "",
        },
        "",
      ),
    ).toEqual({ interface: "terminal", command: "claude" });
  });

  it("writes the Chat arm with a parsed argv vector", () => {
    expect(
      launchFromEditorState(
        {
          interfaceKind: "chat",
          terminalCommand: "",
          chatCommand: " cursor-agent ",
          args: " acp ",
        },
        "",
      ),
    ).toEqual({ interface: "chat", command: "cursor-agent", args: ["acp"] });
  });

  it("never puts a config directory on the Chat arm", () => {
    const launch = launchFromEditorState(
      {
        interfaceKind: "chat",
        terminalCommand: "",
        chatCommand: "cursor-agent",
        args: "acp",
      },
      "/Users/d/.cursor-work",
    );
    expect(launch).not.toHaveProperty("configDir");
  });

  it("saves an empty argv when the field is blank", () => {
    expect(
      launchFromEditorState(
        {
          interfaceKind: "chat",
          terminalCommand: "",
          chatCommand: "opencode",
          args: "",
        },
        "",
      ),
    ).toEqual({ interface: "chat", command: "opencode", args: [] });
  });

  it("round-trips a Chat profile unchanged — open, save, and the argv is intact", () => {
    const state = editorStateFromProfile({
      launch: {
        interface: "chat",
        command: "npx",
        args: ["-y", "@scope/pkg@1.2.3", "--flag", "a b"],
      },
    });
    expect(launchFromEditorState(state, "")).toEqual({
      interface: "chat",
      command: "npx",
      args: ["-y", "@scope/pkg@1.2.3", "--flag", "a b"],
    });
  });

  it("round-trips a Terminal profile unchanged", () => {
    const state = editorStateFromProfile(terminalProfile);
    expect(launchFromEditorState(state, state.configDir)).toEqual(
      terminalProfile.launch,
    );
  });
});

describe("switching arms", () => {
  it("keeps each arm's command to itself — the bug that spawned a shell alias", () => {
    // Authoring a Terminal profile, then switching Interface to Chat, must not
    // hand `claude-work` (an alias) to `exec`: it fails with
    // "No such file or directory" at spawn, long after the switch.
    const state = editorStateFromProfile(terminalProfile);
    const switched = { ...state, interfaceKind: "chat" as const };
    expect(launchFromEditorState(switched, "")).toEqual({
      interface: "chat",
      command: "",
      args: [],
    });
  });

  it("restores the Terminal command when switching back", () => {
    const state = editorStateFromProfile(terminalProfile);
    const toChat = { ...state, interfaceKind: "chat" as const };
    const andBack = { ...toChat, interfaceKind: "terminal" as const };
    expect(launchFromEditorState(andBack, state.configDir)).toEqual(
      terminalProfile.launch,
    );
  });
});
