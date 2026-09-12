import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AgentProfile } from "../../state/types";

const { pickWorkspaceFolder, launchAgentProfile, resolveChatProfileHost } =
  vi.hoisted(() => ({
    pickWorkspaceFolder: vi.fn(async () => "/ws" as string | null),
    launchAgentProfile: vi.fn(
      () => ({ id: "term-1", title: "term" }) as unknown,
    ),
    // The real resolver reads the live dock-panel-kind registry, which no test
    // populates — stub the answer so the dispatch itself is what is under test.
    resolveChatProfileHost: vi.fn(
      () => ({ id: "acp-chat" }) as unknown as { id: string } | undefined,
    ),
  }));

vi.mock("../pick-folder", () => ({ pickWorkspaceFolder }));
vi.mock("./agent-launch", () => ({ launchAgentProfile }));
vi.mock("./chat-profile-host", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./chat-profile-host")>();
  return { ...actual, resolveChatProfileHost };
});

const { store } = await import("../../state/store");
const { startAgentProfile } = await import("./agent-profile-start");

function terminalProfile(over: Partial<AgentProfile> = {}): AgentProfile {
  return {
    id: "claude-work",
    label: "Claude Code (work)",
    launch: { interface: "terminal", command: "claude-work" },
    ...over,
  } as AgentProfile;
}

function chatProfile(over: Partial<AgentProfile> = {}): AgentProfile {
  return {
    id: "cursor-chat",
    label: "cursor chat",
    launch: { interface: "chat", command: "cursor-agent", args: ["acp"] },
    ...over,
  } as AgentProfile;
}

beforeEach(() => {
  pickWorkspaceFolder.mockReset().mockResolvedValue("/ws");
  launchAgentProfile
    .mockReset()
    .mockReturnValue({ id: "term-1", title: "term" });
  resolveChatProfileHost.mockReset().mockReturnValue({ id: "acp-chat" });
  store.workspaces = {
    w: {
      id: "w",
      name: "w",
      folder: "/ws",
      createdAt: "",
      lastOpenedAt: "",
      terminals: [],
      editors: [],
      dockLayout: null,
      previewEditorId: null,
    },
  };
  store.activeWorkspaceId = "w";
});

describe("startAgentProfile — Terminal profiles", () => {
  it("creates the terminal record and hands it back for the caller to place", async () => {
    const start = await startAgentProfile(terminalProfile(), "w");
    expect(start).toEqual({
      outcome: "terminal",
      record: { id: "term-1", title: "term" },
    });
    expect(launchAgentProfile).toHaveBeenCalledWith({
      profileId: "claude-work",
      workspaceId: "w",
      cwd: "/ws",
    });
  });

  it("cancels silently when the folder chooser is dismissed — creating nothing", async () => {
    pickWorkspaceFolder.mockResolvedValue(null);
    expect(await startAgentProfile(terminalProfile(), "w")).toEqual({
      outcome: "cancelled",
    });
    expect(launchAgentProfile).not.toHaveBeenCalled();
  });

  it("cancels when the profile vanished between the gesture and the click", async () => {
    launchAgentProfile.mockReturnValue(undefined);
    expect(await startAgentProfile(terminalProfile(), "w")).toEqual({
      outcome: "cancelled",
    });
  });
});

describe("startAgentProfile — Chat profiles", () => {
  it("resolves the panel kind that claims Chat profiles, with seeded params", async () => {
    const start = await startAgentProfile(chatProfile(), "w");
    expect(start).toEqual({
      outcome: "panel",
      panelKindId: "acp-chat",
      title: "cursor chat",
      params: { profileId: "cursor-chat", title: "cursor chat" },
    });
    expect(launchAgentProfile).not.toHaveBeenCalled();
  });

  it("never asks for a working directory — a transcript has no cwd question", async () => {
    await startAgentProfile(chatProfile(), "w");
    expect(pickWorkspaceFolder).not.toHaveBeenCalled();
  });

  it("refuses with a message when no installed panel claims the job", async () => {
    // The gate went off, or the bundled panel was disabled with nothing in its
    // place. Silence here is what sent the user hunting.
    resolveChatProfileHost.mockReturnValue(undefined);
    const start = await startAgentProfile(chatProfile(), "w");
    expect(start.outcome).toBe("refused");
    expect(start.outcome === "refused" && start.message).toMatch(/Chat panel/);
  });
});

describe("startAgentProfile — no workspace", () => {
  it("cancels rather than guessing one", async () => {
    expect(await startAgentProfile(terminalProfile(), "missing")).toEqual({
      outcome: "cancelled",
    });
    expect(launchAgentProfile).not.toHaveBeenCalled();
  });

  it("falls back to the active workspace when none is named", async () => {
    await startAgentProfile(terminalProfile());
    expect(launchAgentProfile).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "w" }),
    );
  });
});

describe("startAgentProfile — a record predating the launch union", () => {
  it("falls through to the terminal path, exactly as before it existed", async () => {
    // `launchAgentProfile` refuses anything it cannot type, so the worst case
    // is a no-op rather than a wrong spawn.
    const legacy = { id: "old", label: "old" } as unknown as AgentProfile;
    const start = await startAgentProfile(legacy, "w");
    expect(start.outcome).toBe("terminal");
    expect(resolveChatProfileHost).not.toHaveBeenCalled();
  });
});
