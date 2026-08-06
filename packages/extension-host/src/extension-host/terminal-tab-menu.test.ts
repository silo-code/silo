import { describe, it, expect, afterEach } from "vitest";
import { store } from "../state/store";
import { buildTerminalTabMenuItems } from "./terminal-tab-menu";
import { registerContextMenuItem } from "./context-menu-items";

const disposables: { dispose(): void }[] = [];

function addWorkspace(id: string, terminalIds: string[]) {
  store.workspaces[id] = {
    id,
    name: id,
    folder: `/tmp/${id}`,
    createdAt: "2026-01-01T00:00:00Z",
    lastOpenedAt: "2026-01-01T00:00:00Z",
    terminals: terminalIds.map((tid) => ({
      id: tid,
      sessionId: `s_${tid}`,
      kind: "claude",
      title: tid,
    })),
    editors: [],
  } as (typeof store.workspaces)[string];
}

function labels(items: ReturnType<typeof buildTerminalTabMenuItems>): string[] {
  return items.map((i) => ("label" in i ? i.label : `--${i.type}--`));
}

afterEach(() => {
  for (const d of disposables.splice(0)) d.dispose();
  for (const id of Object.keys(store.workspaces)) delete store.workspaces[id];
  store.activeWorkspaceId = null;
});

describe("buildTerminalTabMenuItems", () => {
  it("returns nothing for a terminal no workspace owns", () => {
    expect(buildTerminalTabMenuItems("t_missing")).toEqual([]);
  });

  it("offers Rename… for a known terminal", () => {
    addWorkspace("ws_1", ["t1"]);
    expect(labels(buildTerminalTabMenuItems("t1"))).toEqual(["Rename…"]);
  });

  it("finds the owner workspace even when it isn't the active one", () => {
    addWorkspace("ws_1", ["t1"]);
    addWorkspace("ws_2", ["t2"]);
    store.activeWorkspaceId = "ws_1";
    // The whole point of the accessor: a surface listing terminals across
    // every workspace can right-click one that isn't in the active workspace.
    expect(labels(buildTerminalTabMenuItems("t2"))).toEqual(["Rename…"]);
  });

  it("ignores a preferred workspace that doesn't own the terminal", () => {
    addWorkspace("ws_1", ["t1"]);
    addWorkspace("ws_2", ["t2"]);
    expect(
      labels(buildTerminalTabMenuItems("t2", { workspaceId: "ws_1" })),
    ).toEqual(["Rename…"]);
  });
});

describe("contributions", () => {
  it("appends terminal/tab entries behind a separator", () => {
    addWorkspace("ws_1", ["t1"]);
    disposables.push(
      registerContextMenuItem({
        id: "ext.follow-up",
        surface: "terminal/tab",
        label: "Add Follow-up",
        run: () => {},
      }),
    );
    expect(labels(buildTerminalTabMenuItems("t1"))).toEqual([
      "Rename…",
      "--separator--",
      "Add Follow-up",
    ]);
  });

  it("passes the resolved workspace id to the contribution's target", () => {
    addWorkspace("ws_2", ["t2"]);
    let seen: { terminalId: string; workspaceId: string } | null = null;
    disposables.push(
      registerContextMenuItem({
        id: "ext.probe",
        surface: "terminal/tab",
        label: "Probe",
        run: () => {},
        when: (_keys, target) => {
          seen = target;
          return true;
        },
      }),
    );
    buildTerminalTabMenuItems("t2");
    expect(seen).toEqual({ terminalId: "t2", workspaceId: "ws_2" });
  });
});
