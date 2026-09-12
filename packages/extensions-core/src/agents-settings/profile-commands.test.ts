import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ExtensionContext } from "@silo-code/sdk";
import type { AgentProfile } from "@silo-code/extension-host/internal";

// `startAgentProfile` is the host's one dispatch over the `launch` union
// (Session 3.7) and owns the terminal-record side effect and the
// resolve-the-Chat-host lookup. Both need a live registry no test populates, so
// stub the *answer* here — what this unit is responsible for is placement, and
// the dispatch itself is tested in `agents/agent-profile-start.test.ts`.
const { openSettings, startAgentProfile } = vi.hoisted(() => ({
  openSettings: vi.fn(),
  startAgentProfile: vi.fn(async () => ({
    outcome: "terminal" as const,
    record: { id: "term-1", title: "term" },
  })),
}));

vi.mock("@silo-code/extension-host/internal", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@silo-code/extension-host/internal")>();
  return { ...actual, openSettings, startAgentProfile };
});

/** The three outcomes this unit places, as `startAgentProfile` returns them. */
const asTerminal = { outcome: "terminal", record: { id: "t1", title: "t" } };
const asPanel = {
  outcome: "panel",
  panelKindId: "acp-chat",
  title: "cursor chat",
  params: { profileId: "cursor-chat", title: "cursor chat" },
};
const asRefused = {
  outcome: "refused",
  message: "“cursor chat” is a Chat profile and no Chat panel is installed.",
};

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
  startAgentProfile.mockClear();
  startAgentProfile.mockResolvedValue(asTerminal);
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
    expect(startAgentProfile).not.toHaveBeenCalled();
  });

  it("launches the flagged default over list order", async () => {
    store.activeWorkspaceId = "w";
    addAgentProfile(p({ id: "a" }));
    addAgentProfile(p({ id: "b", default: true }));
    dispose = registerProfileCommands(fakeCtx()).dispose;

    commandRegistry.get("core.newAgent")?.run();
    await vi.waitFor(() =>
      expect(startAgentProfile).toHaveBeenCalledWith(
        expect.objectContaining({ id: "b" }),
        "w",
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
      expect(startAgentProfile).toHaveBeenCalledWith(
        expect.objectContaining({ id: "first" }),
        "w",
      ),
    );
  });
});

// Session 3.7: this unit no longer decides *what* starting a profile means —
// `startAgentProfile` does, and the `+` menu shares it, so a keybinding and a
// click cannot disagree. What is left here is placement, and a command has the
// least of it: no dock group to target.
describe("registerProfileCommands — placing what the dispatch returned", () => {
  beforeEach(() => {
    openPanel.mockClear();
    notify.mockClear();
  });

  it("opens a Chat profile's panel into the layout's default position", async () => {
    store.activeWorkspaceId = "w";
    startAgentProfile.mockResolvedValue(asPanel);
    addAgentProfile(chatProfile({ id: "cursor-chat" }));
    dispose = registerProfileCommands(fakeCtx()).dispose;

    commandRegistry.get("core.newAgent.cursor-chat")?.run();
    await vi.waitFor(() =>
      expect(openPanel).toHaveBeenCalledWith(
        "acp-chat",
        expect.objectContaining({ profileId: "cursor-chat" }),
      ),
    );
    expect(notify).not.toHaveBeenCalled();
  });

  it("surfaces a refusal rather than doing nothing", async () => {
    // The silence this replaces is what sent the user hunting for a Chat panel
    // that was not installed.
    store.activeWorkspaceId = "w";
    startAgentProfile.mockResolvedValue(asRefused);
    addAgentProfile(chatProfile({ id: "cursor-chat" }));
    dispose = registerProfileCommands(fakeCtx()).dispose;

    commandRegistry.get("core.newAgent.cursor-chat")?.run();
    await vi.waitFor(() =>
      expect(notify).toHaveBeenCalledWith("warn", asRefused.message),
    );
    expect(openPanel).not.toHaveBeenCalled();
  });

  it("places nothing for a Terminal profile — the record is what makes the tab", async () => {
    store.activeWorkspaceId = "w";
    startAgentProfile.mockResolvedValue(asTerminal);
    addAgentProfile(p({ id: "claude-work" }));
    dispose = registerProfileCommands(fakeCtx()).dispose;

    commandRegistry.get("core.newAgent.claude-work")?.run();
    await vi.waitFor(() => expect(startAgentProfile).toHaveBeenCalled());
    expect(openPanel).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("is silent on a cancelled start — a dismissed folder chooser is not an error", async () => {
    store.activeWorkspaceId = "w";
    startAgentProfile.mockResolvedValue({ outcome: "cancelled" });
    addAgentProfile(p({ id: "claude-work" }));
    dispose = registerProfileCommands(fakeCtx()).dispose;

    commandRegistry.get("core.newAgent.claude-work")?.run();
    await vi.waitFor(() => expect(startAgentProfile).toHaveBeenCalled());
    expect(openPanel).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
});
