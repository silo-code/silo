import { describe, it, expect, beforeEach } from "vitest";
import type { AgentProfile, TerminalRecord, WorkspaceInternal } from "./types";
import { store } from "./store";
import {
  getAgentProfiles,
  addAgentProfile,
  updateAgentProfile,
  removeAgentProfile,
  moveAgentProfile,
  setDefaultAgentProfile,
  clearDefaultAgentProfile,
  replaceAgentProfiles,
  subscribeAgentProfiles,
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

describe("default flag (RFC 0033 phase 2)", () => {
  it("setDefaultAgentProfile marks one and clears the previous in one mutation", () => {
    addAgentProfile(p({ id: "a" }));
    addAgentProfile(p({ id: "b" }));
    setDefaultAgentProfile("a");
    expect(getAgentProfiles().filter((x) => x.default).map((x) => x.id)).toEqual([
      "a",
    ]);
    setDefaultAgentProfile("b");
    expect(getAgentProfiles().filter((x) => x.default).map((x) => x.id)).toEqual([
      "b",
    ]);
  });

  it("setDefaultAgentProfile is a no-op for an unknown id", () => {
    addAgentProfile(p({ id: "a", default: true }));
    setDefaultAgentProfile("nope");
    expect(getAgentProfiles()[0].default).toBe(true);
  });

  it("clearDefaultAgentProfile removes the flag from every profile", () => {
    addAgentProfile(p({ id: "a", default: true }));
    addAgentProfile(p({ id: "b" }));
    clearDefaultAgentProfile();
    expect(getAgentProfiles().some((x) => x.default)).toBe(false);
  });

  it("deleting the default promotes nobody", () => {
    addAgentProfile(p({ id: "a" }));
    addAgentProfile(p({ id: "b", default: true }));
    removeAgentProfile("b");
    expect(getAgentProfiles().some((x) => x.default)).toBe(false);
  });

  it("an id rename preserves the default flag", () => {
    addAgentProfile(p({ id: "a", default: true }));
    updateAgentProfile("a", { id: "a2" });
    expect(getAgentProfiles()[0]).toMatchObject({ id: "a2", default: true });
  });
});

describe("replaceAgentProfiles — the hydrate seam (RFC 0033 phase 2)", () => {
  it("preserves the array identity so pre-hydrate subscribers survive", () => {
    const original = store.agentProfiles;
    replaceAgentProfiles([p({ id: "a" }), p({ id: "b" })]);
    expect(store.agentProfiles).toBe(original);
    expect(getAgentProfiles().map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("notifies a subscriber that attached before it was populated", async () => {
    let ticks = 0;
    const unsub = subscribeAgentProfiles(() => ticks++);
    replaceAgentProfiles([p({ id: "claude" })]);
    // valtio batches to a microtask
    await Promise.resolve();
    await Promise.resolve();
    unsub();
    expect(ticks).toBeGreaterThan(0);
  });

  it("clones entries so the caller's array can't alias the store", () => {
    const src = [p({ id: "a" })];
    replaceAgentProfiles(src);
    src[0].label = "mutated by caller";
    expect(getAgentProfiles()[0].label).toBe("Claude (work)");
  });

  it("replaces rather than appends on a second call", () => {
    replaceAgentProfiles([p({ id: "a" }), p({ id: "b" })]);
    replaceAgentProfiles([p({ id: "c" })]);
    expect(getAgentProfiles().map((x) => x.id)).toEqual(["c"]);
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
