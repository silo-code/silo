import { describe, it, expect } from "vitest";
import {
  configDirEnvVarForAgent,
  type AgentProfile,
} from "@silo-code/extension-host/internal";
import {
  editorStateFromProfile,
  launchFromEditorState,
  CHAT_CHOICE_CUSTOM,
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
      chatChoice: "",
      chatEnv: {},
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

  it("classifies a recognised Chat launch as its catalog agent", () => {
    expect(editorStateFromProfile(chatProfile).chatChoice).toBe("cursor");
    expect(
      editorStateFromProfile({
        launch: {
          interface: "chat",
          command: "npx",
          args: ["-y", "@agentclientprotocol/claude-agent-acp@0.75.1"],
        },
      }).chatChoice,
    ).toBe("claude");
  });

  // The migration rule, and Dave's `claude-personal` profile: a launch Silo
  // did not compose presents as Custom… rather than being re-authored into the
  // catalog's current answer.
  it("classifies an unrecognised Chat launch as Custom", () => {
    expect(
      editorStateFromProfile({
        launch: { interface: "chat", command: "claude-personal", args: [] },
      }).chatChoice,
    ).toBe(CHAT_CHOICE_CUSTOM);
  });

  it("leaves chatChoice unset for a Terminal profile — nothing has been picked", () => {
    expect(editorStateFromProfile(terminalProfile).chatChoice).toBe("");
    expect(editorStateFromProfile().chatChoice).toBe("");
  });

  it("lifts a Chat profile's config dir out of env into the field", () => {
    const state = editorStateFromProfile({
      launch: {
        interface: "chat",
        command: "npx",
        args: ["-y", "@agentclientprotocol/claude-agent-acp@0.75.1"],
        env: { CLAUDE_CONFIG_DIR: "/Users/d/.claude-personal" },
      },
      assumedAgentId: "claude",
    });
    expect(state.configDir).toBe("/Users/d/.claude-personal");
    // Lifted, not duplicated — otherwise saving would write it twice.
    expect(state.chatEnv).toEqual({});
  });

  it("carries an env key it has no field for straight through", () => {
    const state = editorStateFromProfile({
      launch: {
        interface: "chat",
        command: "npx",
        args: ["-y", "pi-acp@0.0.33"],
        env: { PI_CODING_AGENT_DIR: "/Users/d/.pi-alt", SOME_OTHER: "keep-me" },
      },
      assumedAgentId: "pi",
    });
    expect(state.configDir).toBe("/Users/d/.pi-alt");
    expect(state.chatEnv).toEqual({ SOME_OTHER: "keep-me" });
  });

  it("recovers the agent from the launch when assumedAgentId is missing", () => {
    // A hand-written profile: without this the config-dir env var could not be
    // resolved and a saved CLAUDE_CONFIG_DIR would have no field to appear in.
    const state = editorStateFromProfile({
      launch: {
        interface: "chat",
        command: "npx",
        args: ["-y", "@agentclientprotocol/claude-agent-acp@0.75.1"],
        env: { CLAUDE_CONFIG_DIR: "/Users/d/.claude-personal" },
      },
    });
    expect(state.agentOverride).toBe("claude");
    expect(state.configDir).toBe("/Users/d/.claude-personal");
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
          chatEnv: {},
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
          chatEnv: {},
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
          chatEnv: {},
        },
        "",
      ),
    ).toEqual({ interface: "chat", command: "cursor-agent", args: ["acp"] });
  });

  // The same field, two destinations: Chat is `exec`'d with no shell, so there
  // is nowhere to put a `VAR='path'` prefix — the path becomes an env entry.
  it("writes the Chat arm's config directory into env, never configDir", () => {
    const launch = launchFromEditorState(
      {
        interfaceKind: "chat",
        terminalCommand: "",
        chatCommand: "npx",
        args: "-y @agentclientprotocol/claude-agent-acp@0.75.1",
        chatEnv: {},
      },
      "/Users/d/.claude-personal",
      "CLAUDE_CONFIG_DIR",
    );
    expect(launch).not.toHaveProperty("configDir");
    expect(launch).toMatchObject({
      env: { CLAUDE_CONFIG_DIR: "/Users/d/.claude-personal" },
    });
  });

  it("omits env entirely rather than storing an empty one", () => {
    expect(
      launchFromEditorState(
        {
          interfaceKind: "chat",
          terminalCommand: "",
          chatCommand: "cursor-agent",
          args: "acp",
          chatEnv: {},
        },
        "/Users/d/.cursor-work",
        // Cursor declares no configDirEnvVar — credentials resolve from $HOME
        // regardless, so there is nowhere honest to put this path.
        undefined,
      ),
    ).toEqual({ interface: "chat", command: "cursor-agent", args: ["acp"] });
  });

  it("preserves an env key the editor has no field for", () => {
    expect(
      launchFromEditorState(
        {
          interfaceKind: "chat",
          terminalCommand: "",
          chatCommand: "npx",
          args: "-y pi-acp@0.0.33",
          chatEnv: { SOME_OTHER: "keep-me" },
        },
        "/Users/d/.pi-alt",
        "PI_CODING_AGENT_DIR",
      ),
    ).toMatchObject({
      env: { SOME_OTHER: "keep-me", PI_CODING_AGENT_DIR: "/Users/d/.pi-alt" },
    });
  });

  it("saves an empty argv when the field is blank", () => {
    expect(
      launchFromEditorState(
        {
          interfaceKind: "chat",
          terminalCommand: "",
          chatCommand: "opencode",
          args: "",
          chatEnv: {},
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

  // Session 3.6's Done-when: open an existing Chat profile, save without
  // touching anything, and the stored `launch` is identical. It must hold for
  // every shape the editor can be handed, including ones it would compose
  // differently today.
  describe("saving without an edit changes nothing", () => {
    const cases: Record<
      string,
      { launch: AgentProfile["launch"]; assumedAgentId?: string }
    > = {
      "a builtin agent": {
        launch: { interface: "chat", command: "cursor-agent", args: ["acp"] },
        assumedAgentId: "cursor",
      },
      "an adapter agent with a second account": {
        launch: {
          interface: "chat",
          command: "npx",
          args: ["-y", "@agentclientprotocol/claude-agent-acp@0.75.1"],
          env: { CLAUDE_CONFIG_DIR: "/Users/d/.claude-personal" },
        },
        assumedAgentId: "claude",
      },
      // A version the catalog no longer pins: recognising it as Claude's must
      // not rewrite the pin to the current one.
      "an adapter pinned to a superseded version": {
        launch: {
          interface: "chat",
          command: "npx",
          args: ["-y", "@agentclientprotocol/claude-agent-acp@0.60.0"],
        },
        assumedAgentId: "claude",
      },
      // Dave's live repro. A shell alias can never work under `exec`, and the
      // editor must still hand it back unchanged rather than "fixing" it.
      "a launch that cannot work at all": {
        launch: { interface: "chat", command: "claude-personal", args: [] },
        assumedAgentId: "claude",
      },
      "a locally built ACP server": {
        launch: {
          interface: "chat",
          command: "/usr/local/bin/my-acp",
          args: ["serve", "--port 0"],
        },
      },
    };

    for (const [name, seed] of Object.entries(cases)) {
      it(name, () => {
        const state = editorStateFromProfile(seed);
        const envVar = configDirEnvVarForAgent(
          state.agentOverride || undefined,
        );
        expect(launchFromEditorState(state, state.configDir, envVar)).toEqual(
          seed.launch,
        );
      });
    }
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
