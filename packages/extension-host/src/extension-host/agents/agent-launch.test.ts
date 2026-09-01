import { describe, it, expect, vi, beforeEach } from "vitest";

const { ensureSession, sendInput, onOutput } = vi.hoisted(() => ({
  ensureSession: vi.fn(() => Promise.resolve("sess-bg")),
  sendInput: vi.fn(),
  onOutput: vi.fn(() => () => {}),
}));
vi.mock("../terminal-service", () => ({ ensureSession }));
vi.mock("../../services/tauri-terminal-client", () => ({
  tauriTerminalClient: { sendInput, onOutput },
}));
vi.mock("../ui-service", () => ({ pushToast: vi.fn() }));
vi.mock("../settings-sheet", () => ({ openSettings: vi.fn() }));

import { store } from "../../state/store";
import type { WorkspaceInternal } from "../../state/types";
import { addAgentProfile } from "../../state/agent-profiles";
import { launchAgentProfile } from "./agent-launch";
import {
  drainPendingLaunch,
  hasPendingLaunch,
  takePendingLaunch,
} from "./pending-launch";

function ws(id: string): WorkspaceInternal {
  return {
    id,
    name: id,
    folder: `/ws/${id}`,
    createdAt: "",
    lastOpenedAt: "",
    terminals: [],
    editors: [],
    dockLayout: null,
    previewEditorId: null,
  };
}

beforeEach(() => {
  store.workspaces = { active: ws("active"), bg: ws("bg") };
  store.activeWorkspaceId = "active";
  store.agentProfiles = [];
  ensureSession.mockClear().mockResolvedValue("sess-bg");
  sendInput.mockReset();
  onOutput.mockReset().mockReturnValue(() => {});
  addAgentProfile({ id: "cw", label: "Claude (work)", command: "claude-work" });
});

describe("launchAgentProfile (RFC 0033 R6)", () => {
  it("creates a record with profileId, no seeded title, and registers a pending launch — no spawn for the foreground case", () => {
    const rec = launchAgentProfile({ profileId: "cw" });
    expect(rec).toBeDefined();
    expect(rec?.profileId).toBe("cw");
    expect(rec?.title).toBe("Terminal");
    expect(rec?.sessionId).toBe("");
    expect(hasPendingLaunch(rec!.id)).toBe(true);
    expect(ensureSession).not.toHaveBeenCalled();
  });

  it("returns undefined for an unknown workspace or profile", () => {
    expect(
      launchAgentProfile({ profileId: "cw", workspaceId: "nope" }),
    ).toBeUndefined();
    expect(launchAgentProfile({ profileId: "gone" })).toBeUndefined();
  });

  it("background workspace: spawns via ensureSession, which drains", () => {
    const rec = launchAgentProfile({ profileId: "cw", workspaceId: "bg" });
    expect(rec?.profileId).toBe("cw");
    expect(ensureSession).toHaveBeenCalledWith(rec!.id);
  });

  it("the launch line is written exactly once regardless of drain ordering", () => {
    // panel-ready drains first
    const a = launchAgentProfile({ profileId: "cw" })!;
    a.sessionId = "sess-a";
    drainPendingLaunch(a.id, "sess-a"); // panel
    drainPendingLaunch(a.id, "sess-a"); // ensureSession, later
    expect(sendInput).toHaveBeenCalledTimes(1);
    expect(sendInput).toHaveBeenCalledWith("sess-a", "claude-work\r");
  });

  it("writes nothing when the profile was deleted before the drain", () => {
    const rec = launchAgentProfile({ profileId: "cw" })!;
    store.agentProfiles = [];
    drainPendingLaunch(rec.id, "sess-x");
    expect(sendInput).not.toHaveBeenCalled();
  });

  it("writes nothing when the record was removed (pending launch discarded)", () => {
    const rec = launchAgentProfile({ profileId: "cw" })!;
    takePendingLaunch(rec.id); // simulate discard
    drainPendingLaunch(rec.id, "sess-x");
    expect(sendInput).not.toHaveBeenCalled();
  });
});
