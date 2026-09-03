import { describe, it, expect, vi, beforeEach } from "vitest";

const { ensureSession, sendInput, onOutput, focus, activateWorkspace } =
  vi.hoisted(() => ({
    ensureSession: vi.fn(() => Promise.resolve("sess-bg")),
    sendInput: vi.fn(),
    onOutput: vi.fn(() => () => {}),
    focus: vi.fn(),
    activateWorkspace: vi.fn(),
  }));
vi.mock("../terminal-service", () => ({
  ensureSession,
  getTerminalService: () => ({ focus }),
}));
vi.mock("../../services/tauri-terminal-client", () => ({
  tauriTerminalClient: { sendInput, onOutput },
}));

import { store } from "../../state/store";
import type { WorkspaceInternal } from "../../state/types";
import {
  addAgentProfile,
  setDefaultAgentProfile,
} from "../../state/agent-profiles";
import { setLoginShellForTests } from "../login-shell";
import { MAX_PROMPT_BYTES } from "./agent-prompt";
import {
  createAgentProfilesService,
  invalidateProfileSummaries,
} from "./agent-profiles-service";
import { takePendingLaunch } from "./pending-launch";

// `activateWorkspace` is spied through the real module so the store still
// behaves; only the call is what these tests care about.
vi.mock("../../state/workspaces", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../state/workspaces")>();
  return { ...actual, activateWorkspace };
});

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

const service = createAgentProfilesService();

beforeEach(() => {
  store.workspaces = { active: ws("active"), bg: ws("bg") };
  store.activeWorkspaceId = "active";
  store.agentProfiles = [];
  store.terminalSettings.shell = "";
  setLoginShellForTests("/bin/zsh");
  invalidateProfileSummaries();
  ensureSession.mockClear().mockResolvedValue("sess-bg");
  sendInput.mockReset();
  focus.mockReset();
  activateWorkspace.mockReset();
});

function addClaude(id = "claude"): void {
  addAgentProfile({
    id,
    label: `Claude ${id}`,
    command: "claude",
    assumedAgentId: "claude",
  });
  invalidateProfileSummaries();
}

describe("list()", () => {
  it("returns summaries in list order, not the host's AgentProfile records", () => {
    addAgentProfile({
      id: "work",
      label: "Claude (work)",
      command: "claude-work",
      configDir: "/Users/d/.claude-work",
      assumedAgentId: "claude",
    });
    invalidateProfileSummaries();

    const [summary] = service.list();
    expect(summary).toEqual({
      id: "work",
      label: "Claude (work)",
      isDefault: false,
      acceptsPrompt: true,
    });
    // Launch details stay host-owned — nothing leaks through the summary.
    expect(summary).not.toHaveProperty("command");
    expect(summary).not.toHaveProperty("configDir");
    expect(summary).not.toHaveProperty("assumedAgentId");
  });

  it("is deeply frozen and memoized", () => {
    addClaude();
    const first = service.list();
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first[0])).toBe(true);
    expect(service.list()).toBe(first);
  });

  it("recomputes after the profile list changes", () => {
    addClaude();
    const first = service.list();
    addClaude("second");
    expect(service.list()).not.toBe(first);
    expect(service.list()).toHaveLength(2);
  });

  it("marks the default profile", () => {
    addClaude("a");
    addClaude("b");
    setDefaultAgentProfile("b");
    invalidateProfileSummaries();
    expect(service.list().map((p) => p.isDefault)).toEqual([false, true]);
  });

  it("reports acceptsPrompt false for a profile that matches no agent", () => {
    addAgentProfile({ id: "mine", label: "Mine", command: "my-own-script" });
    invalidateProfileSummaries();
    expect(service.list()[0].acceptsPrompt).toBe(false);
  });
});

describe("launch() — success", () => {
  it("returns the created terminal's id", () => {
    addClaude();
    const result = service.launch({ profileId: "claude" });
    expect(result).toEqual({ ok: true, terminalId: expect.any(String) });
    if (!result.ok) return;
    expect(store.workspaces.active.terminals[0].id).toBe(result.terminalId);
  });

  it("defaults to the resolved default profile", () => {
    addClaude("a");
    addClaude("b");
    setDefaultAgentProfile("b");
    invalidateProfileSummaries();
    const result = service.launch();
    if (!result.ok) throw new Error("expected ok");
    expect(takePendingLaunch(result.terminalId)).toEqual({ profileId: "b" });
  });

  it("activates and focuses by default", () => {
    addClaude();
    service.launch({ profileId: "claude" });
    expect(activateWorkspace).toHaveBeenCalledWith("active");
    expect(focus).toHaveBeenCalled();
  });

  it("leaves focus alone with activate: false", () => {
    addClaude();
    const result = service.launch({ profileId: "claude", activate: false });
    expect(result.ok).toBe(true);
    expect(activateWorkspace).not.toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();
  });

  it("carries a prompt onto the pending launch with the resolved dialect", () => {
    addClaude();
    const result = service.launch({
      profileId: "claude",
      prompt: "fix the CI",
      activate: false,
    });
    if (!result.ok) throw new Error("expected ok");
    expect(takePendingLaunch(result.terminalId)).toEqual({
      profileId: "claude",
      prompt: "fix the CI",
      dialect: "posix",
    });
  });

  it("returns the id for a background workspace, taking the eager-spawn branch", () => {
    // Phase 1 built this branch and only unit-tested it; this is its first
    // exercise through the public surface.
    addClaude();
    const result = service.launch({
      profileId: "claude",
      workspaceId: "bg",
      activate: false,
    });
    if (!result.ok) throw new Error("expected ok");
    expect(ensureSession).toHaveBeenCalledWith(result.terminalId);
    expect(store.workspaces.bg.terminals[0].id).toBe(result.terminalId);
  });
});

describe("launch() — refusals are values, never throws", () => {
  it("refuses a named profile that does not exist", () => {
    addClaude();
    expect(service.launch({ profileId: "ghost" })).toEqual({
      ok: false,
      refusal: "no-profile",
    });
  });

  it("refuses when there are no profiles at all", () => {
    expect(service.launch()).toEqual({ ok: false, refusal: "no-profile" });
  });

  it("refuses a workspace that does not exist", () => {
    addClaude();
    expect(service.launch({ workspaceId: "ghost" })).toEqual({
      ok: false,
      refusal: "no-workspace",
    });
  });

  it("refuses when no workspace is open", () => {
    addClaude();
    store.activeWorkspaceId = null;
    expect(service.launch()).toEqual({ ok: false, refusal: "no-workspace" });
  });

  it("refuses a prompt for a profile that matches no agent", () => {
    addAgentProfile({ id: "mine", label: "Mine", command: "my-own-script" });
    invalidateProfileSummaries();
    expect(service.launch({ prompt: "hi" })).toEqual({
      ok: false,
      refusal: "no-agent",
    });
  });

  it("reports no-agent, not agent-takes-none, for a stale assumedAgentId", () => {
    // A profile written against an agent Silo has since dropped names the
    // wrong problem if taken at its word — the user's fix is "pick an agent",
    // not "this agent can't take prompts".
    addAgentProfile({
      id: "stale",
      label: "Stale",
      command: "my-own-script",
      assumedAgentId: "not-a-real-agent",
    });
    invalidateProfileSummaries();
    expect(service.launch({ prompt: "hi" })).toEqual({
      ok: false,
      refusal: "no-agent",
    });
  });

  it("refuses a prompt on a shell it cannot quote", () => {
    addClaude();
    store.terminalSettings.shell = "/usr/local/bin/nu";
    expect(service.launch({ prompt: "hi" })).toEqual({
      ok: false,
      refusal: "unsupported-shell",
    });
  });

  it("refuses a prompt over the size limit", () => {
    addClaude();
    expect(
      service.launch({ prompt: "x".repeat(MAX_PROMPT_BYTES + 1) }),
    ).toEqual({ ok: false, refusal: "too-large" });
  });

  it("creates nothing at all when a prompt is refused", () => {
    // R7: a precheck refusal costs nothing — no terminal record, no
    // activation, no focus.
    addClaude();
    store.terminalSettings.shell = "/usr/local/bin/nu";
    service.launch({ prompt: "hi" });
    expect(store.workspaces.active.terminals).toHaveLength(0);
    expect(activateWorkspace).not.toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();
  });

  it("never lets a prompt check affect a promptless launch", () => {
    addAgentProfile({ id: "mine", label: "Mine", command: "my-own-script" });
    invalidateProfileSummaries();
    store.terminalSettings.shell = "/usr/local/bin/nu";
    expect(service.launch({ activate: false }).ok).toBe(true);
  });
});
