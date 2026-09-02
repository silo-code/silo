import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ExtensionContext } from "@silo-code/sdk";

const { openSettings, pickWorkspaceFolder, launchAgentProfile } = vi.hoisted(
  () => ({
    openSettings: vi.fn(),
    pickWorkspaceFolder: vi.fn(async () => "/ws"),
    launchAgentProfile: vi.fn(() => ({ id: "term-1" })),
  }),
);

vi.mock("@silo-code/extension-host/internal", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@silo-code/extension-host/internal")
    >();
  return { ...actual, openSettings, pickWorkspaceFolder, launchAgentProfile };
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
function fakeCtx(): ExtensionContext {
  return {
    registerCommand: (cmd) => commandRegistry.register(cmd),
    subscriptions: [],
  } as unknown as ExtensionContext;
}

const p = (over: Partial<{ id: string; label: string; command: string }>) => ({
  id: "claude-work",
  label: "Claude (work)",
  command: "claude-work",
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
