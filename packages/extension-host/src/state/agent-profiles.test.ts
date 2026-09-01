import { describe, it, expect, beforeEach } from "vitest";
import type { AgentProfile, TerminalRecord, WorkspaceInternal } from "./types";
import { store } from "./store";
import {
  getAgentProfiles,
  addAgentProfile,
  updateAgentProfile,
  removeAgentProfile,
  moveAgentProfile,
} from "./agent-profiles";

function ws(id: string, terminals: TerminalRecord[]): WorkspaceInternal {
  return {
    id,
    name: id,
    folder: `/ws/${id}`,
    createdAt: "",
    lastOpenedAt: "",
    terminals,
    editors: [],
    dockLayout: null,
    previewEditorId: null,
  };
}

function term(id: string, profileId?: string): TerminalRecord {
  return {
    id,
    sessionId: "",
    kind: "shell",
    title: "Terminal",
    ...(profileId ? { profileId } : {}),
  };
}

const p = (over: Partial<AgentProfile>): AgentProfile => ({
  id: "claude-work",
  label: "Claude (work)",
  command: "claude-work",
  ...over,
});

beforeEach(() => {
  store.agentProfiles = [];
  store.workspaces = {};
});

describe("agent-profiles CRUD", () => {
  it("adds, updates, and removes", () => {
    addAgentProfile(p({}));
    expect(getAgentProfiles()).toHaveLength(1);
    updateAgentProfile("claude-work", { label: "Work" });
    expect(getAgentProfiles()[0].label).toBe("Work");
    removeAgentProfile("claude-work");
    expect(getAgentProfiles()).toHaveLength(0);
  });

  it("reorders with moveAgentProfile and no-ops at the ends", () => {
    addAgentProfile(p({ id: "a" }));
    addAgentProfile(p({ id: "b" }));
    addAgentProfile(p({ id: "c" }));
    moveAgentProfile("c", -1);
    expect(getAgentProfiles().map((x) => x.id)).toEqual(["a", "c", "b"]);
    moveAgentProfile("a", -1);
    expect(getAgentProfiles().map((x) => x.id)).toEqual(["a", "c", "b"]);
    moveAgentProfile("b", 1);
    expect(getAgentProfiles().map((x) => x.id)).toEqual(["a", "c", "b"]);
  });
});

describe("reference sweep", () => {
  it("rewrites TerminalRecord.profileId across every workspace on id rename", () => {
    store.workspaces = {
      w1: ws("w1", [term("t1", "claude-work"), term("t2")]),
      w2: ws("w2", [term("t3", "claude-work"), term("t4", "other")]),
    };
    addAgentProfile(p({}));
    updateAgentProfile("claude-work", { id: "claude-job" });

    expect(store.workspaces.w1.terminals[0].profileId).toBe("claude-job");
    expect(store.workspaces.w1.terminals[1].profileId).toBeUndefined();
    expect(store.workspaces.w2.terminals[0].profileId).toBe("claude-job");
    expect(store.workspaces.w2.terminals[1].profileId).toBe("other");
    expect(getAgentProfiles()[0].id).toBe("claude-job");
  });

  it("clears profileId on referencing terminals when a profile is deleted", () => {
    store.workspaces = {
      w1: ws("w1", [term("t1", "claude-work"), term("t2", "keep")]),
    };
    addAgentProfile(p({}));
    removeAgentProfile("claude-work");

    expect(store.workspaces.w1.terminals[0].profileId).toBeUndefined();
    expect(store.workspaces.w1.terminals[1].profileId).toBe("keep");
    // the terminal itself is untouched
    expect(store.workspaces.w1.terminals).toHaveLength(2);
  });
});
