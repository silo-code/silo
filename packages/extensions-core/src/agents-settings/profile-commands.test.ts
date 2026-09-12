import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ExtensionContext } from "@silo-code/sdk";
import type { AgentProfile } from "@silo-code/extension-host/internal";

const {
  openSettings,
  pickWorkspaceFolder,
  launchAgentProfile,
  resolveChatProfileHost,
} = vi.hoisted(() => ({
  openSettings: vi.fn(),
  pickWorkspaceFolder: vi.fn(async () => "/ws"),
  launchAgentProfile: vi.fn(() => ({ id: "term-1" })),
  // The real resolver reads the live dock-panel-kind registry, which no test
  // populates — stub the answer so the routing itself is what's under test.
  resolveChatProfileHost: vi.fn(() => ({ id: "acp-chat" })),
}));

vi.mock("@silo-code/extension-host/internal", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@silo-code/extension-host/internal")>();
  return {
    ...actual,
    openSettings,
    pickWorkspaceFolder,
    launchAgentProfile,
    resolveChatProfileHost,
  };
});

const {
  store,
  commandRegistry,
  addAgentProfile,
  updateAgentProfile,
  removeAgentProfile,
} = await import("@silo-code/extension-host/internal");
const { registerProfileCommands } = await import("./profile-commands");

/** Minimal ctx: a real registry-backed `registerCommand` so `commandRegistry`
 *  reflects what the sync did. */
const openPanel = vi.fn();
const notify = vi.fn();

function fakeCtx(): ExtensionContext {
  return {
    registerCommand: (cmd) => commandRegistry.register(cmd),
    layout: { openPanel },
    ui: { notify },
    subscriptions: [],
  } as unknown as ExtensionContext;
}

/** A Terminal-armed profile (RFC 0038's `launch` union — the pre-0038 flat
 *  `command` shape only exists on disk, where load hardening migrates it). */
const p = (
  over: Partial<AgentProfile> & { command?: string } = {},
): AgentProfile => {
  const { command, ...rest } = over;
  return {
    id: "claude-work",
    label: "Claude (work)",
    launch: { interface: "terminal", command: command ?? "claude-work" },
    ...rest,
  };
};

/** A Chat-armed profile — no PTY, so it opens a transcript panel instead. */
const chatProfile = (over: Partial<AgentProfile> = {}): AgentProfile => ({
  id: "cursor-chat",
  label: "Cursor (chat)",
  launch: { interface: "chat", command: "cursor-agent", args: ["acp"] },
  ...over,
});

let dispose: () => void = () => {};

beforeEach(() => {
  dispose(); // tear down the previous test's registrations
  dispose = () => {};
  store.agentProfiles = [];
  store.workspaces = {};
  store.activeWorkspaceId = null;
  openSettings.mockClear();
  pickWorkspaceFolder.mockClear();
  launchAgentProfile.mockClear();
});

function ids(): string[] {
  return commandRegistry
    .list()
    .map((c) => c.id)
    .filter((id) => id.startsWith("core.newAgent"))
    .sort();
}

/** The store subscription is a valtio `subscribe`, which batches to a
 *  microtask — let it flush before asserting the reconcile. */
async function settled<T>(fn: () => T): Promise<T> {
  await Promise.resolve();
  await Promise.resolve();
  return fn();
}

describe("registerProfileCommands — per-profile sync (R1)", () => {
  it("registers a command per profile and the generic one", () => {
    addAgentProfile(p({ id: "claude-work" }));
    addAgentProfile(p({ id: "codex", label: "Codex" }));
    dispose = registerProfileCommands(fakeCtx()).dispose;

    expect(ids()).toEqual([
      "core.newAgent",
      "core.newAgent.claude-work",
      "core.newAgent.codex",
    ]);
    expect(commandRegistry.get("core.newAgent.claude-work")?.label).toBe(
      "New Agent: Claude (work)",
    );
  });

  it("adds a command when a profile is added, drops it on delete", async () => {
    dispose = registerProfileCommands(fakeCtx()).dispose;
    expect(ids()).toEqual(["core.newAgent"]);

    addAgentProfile(p({ id: "a" }));
    expect(await settled(ids)).toContain("core.newAgent.a");

    removeAgentProfile("a");
    expect(await settled(ids)).toEqual(["core.newAgent"]);
  });

  it("re-keys the command on an id rename (old id gone, no duplicate throw)", async () => {
    addAgentProfile(p({ id: "a" }));
    dispose = registerProfileCommands(fakeCtx()).dispose;

    expect(() => updateAgentProfile("a", { id: "b" })).not.toThrow();
    expect(await settled(ids)).toEqual(["core.newAgent", "core.newAgent.b"]);
  });

  it("refreshes the label when only the label changes", async () => {
    addAgentProfile(p({ id: "a", label: "Old" }));
    dispose = registerProfileCommands(fakeCtx()).dispose;

    updateAgentProfile("a", { label: "New" });
    expect(
      await settled(() => commandRegistry.get("core.newAgent.a")?.label),
    ).toBe("New Agent: New");
  });

  it("disposes every registration and the subscription on dispose", async () => {
    addAgentProfile(p({ id: "a" }));
    const d = registerProfileCommands(fakeCtx());
    d.dispose();
    expect(ids()).toEqual([]);

    // A later profile change must not resurrect anything.
    addAgentProfile(p({ id: "b" }));
    expect(await settled(ids)).toEqual([]);
    dispose = () => {};
  });
});

describe("registerProfileCommands — generic command (R3)", () => {
  it("opens Agents settings when there are no profiles", () => {
    dispose = registerProfileCommands(fakeCtx()).dispose;
    commandRegistry.get("core.newAgent")?.run();
    expect(openSettings).toHaveBeenCalledWith("agents");
    expect(launchAgentProfile).not.toHaveBeenCalled();
  });

  it("launches the flagged default over list order", async () => {
    store.activeWorkspaceId = "w";
    addAgentProfile(p({ id: "a" }));
    addAgentProfile(p({ id: "b", default: true }));
    dispose = registerProfileCommands(fakeCtx()).dispose;

    commandRegistry.get("core.newAgent")?.run();
    await vi.waitFor(() =>
      expect(launchAgentProfile).toHaveBeenCalledWith(
        expect.objectContaining({ profileId: "b" }),
      ),
    );
  });

  it("launches the first profile when none is flagged default", async () => {
    store.activeWorkspaceId = "w";
    addAgentProfile(p({ id: "first" }));
    addAgentProfile(p({ id: "second" }));
    dispose = registerProfileCommands(fakeCtx()).dispose;

    commandRegistry.get("core.newAgent")?.run();
    await vi.waitFor(() =>
      expect(launchAgentProfile).toHaveBeenCalledWith(
        expect.objectContaining({ profileId: "first" }),
      ),
    );
  });
});

// RFC 0038: a Chat profile has no PTY, so "start this profile" has to mean
// "open a transcript panel" — otherwise the command (and the dock's + menu
// entry, which shares this resolution) is a silent no-op.
describe("registerProfileCommands — Chat profiles (RFC 0038)", () => {
  beforeEach(() => {
    openPanel.mockClear();
    notify.mockClear();
    resolveChatProfileHost.mockReturnValue({ id: "acp-chat" });
  });

  it("opens the chat-profile host panel instead of launching a terminal", async () => {
    store.activeWorkspaceId = "w";
    addAgentProfile(chatProfile({ id: "cursor-chat" }));
    dispose = registerProfileCommands(fakeCtx()).dispose;

    commandRegistry.get("core.newAgent.cursor-chat")?.run();
    await vi.waitFor(() =>
      expect(openPanel).toHaveBeenCalledWith(
        "acp-chat",
        expect.objectContaining({ profileId: "cursor-chat" }),
      ),
    );
    expect(launchAgentProfile).not.toHaveBeenCalled();
    // No PTY means no working-directory question to ask.
    expect(pickWorkspaceFolder).not.toHaveBeenCalled();
  });

  it("says so when no Chat panel is installed, rather than doing nothing", async () => {
    store.activeWorkspaceId = "w";
    resolveChatProfileHost.mockReturnValue(undefined);
    addAgentProfile(chatProfile({ id: "cursor-chat" }));
    dispose = registerProfileCommands(fakeCtx()).dispose;

    commandRegistry.get("core.newAgent.cursor-chat")?.run();
    await vi.waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        "warn",
        expect.stringMatching(/Chat/),
      ),
    );
    expect(openPanel).not.toHaveBeenCalled();
    expect(launchAgentProfile).not.toHaveBeenCalled();
  });

  it("still launches a terminal for a Terminal profile", async () => {
    store.activeWorkspaceId = "w";
    addAgentProfile(p({ id: "claude-work" }));
    dispose = registerProfileCommands(fakeCtx()).dispose;

    commandRegistry.get("core.newAgent.claude-work")?.run();
    await vi.waitFor(() =>
      expect(launchAgentProfile).toHaveBeenCalledWith(
        expect.objectContaining({ profileId: "claude-work" }),
      ),
    );
    expect(openPanel).not.toHaveBeenCalled();
  });
});
