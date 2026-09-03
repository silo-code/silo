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
import { launchAgentProfile, launchShellDialect } from "./agent-launch";
import { setLoginShellForTests } from "../login-shell";
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

describe("launchAgentProfile — an opening prompt (RFC 0033 phase 3)", () => {
  it("threads prompt and dialect onto the pending launch", () => {
    const rec = launchAgentProfile({
      profileId: "cw",
      prompt: "fix the CI",
      dialect: "posix",
    })!;
    expect(takePendingLaunch(rec.id)).toEqual({
      profileId: "cw",
      prompt: "fix the CI",
      dialect: "posix",
    });
  });

  it("leaves the claim promptless when no prompt is given", () => {
    const rec = launchAgentProfile({ profileId: "cw" })!;
    expect(takePendingLaunch(rec.id)).toEqual({ profileId: "cw" });
  });

  it("still takes the background eager-spawn branch with a prompt", () => {
    const rec = launchAgentProfile({
      profileId: "cw",
      workspaceId: "bg",
      prompt: "fix the CI",
      dialect: "posix",
    })!;
    expect(ensureSession).toHaveBeenCalledWith(rec.id);
  });
});

describe("launchShellDialect (RFC 0033 phase 3)", () => {
  beforeEach(() => {
    store.terminalSettings.shell = "";
    setLoginShellForTests(undefined);
  });

  it("prefers the Terminal setting's explicit shell — that is what gets exec'd", () => {
    store.terminalSettings.shell = "/opt/homebrew/bin/fish";
    setLoginShellForTests("/bin/zsh");
    expect(launchShellDialect()).toBe("fish");
  });

  it("falls back to the login shell when the setting is empty", () => {
    setLoginShellForTests("/bin/zsh");
    expect(launchShellDialect()).toBe("posix");
  });

  it("is unsupported — never assumed POSIX — when neither is known", () => {
    expect(launchShellDialect()).toBe("unsupported");
  });
});
