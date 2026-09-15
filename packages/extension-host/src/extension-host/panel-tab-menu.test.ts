import { describe, it, expect, afterEach } from "vitest";
import type { DockPanelKind } from "@silo-code/sdk";
import { store } from "../state/store";
import { buildPanelTabMenuItems } from "./panel-tab-menu";
import { dockPanelKindRegistry } from "./dock-panel-kinds";
import { registerContextMenuItem } from "./context-menu-items";

const disposables: { dispose(): void }[] = [];

function registerKind(id: string, over: Partial<DockPanelKind> = {}) {
  disposables.push(
    dockPanelKindRegistry.register({
      id,
      component: () => null,
      ...over,
    } as DockPanelKind),
  );
}

function addWorkspace(
  id: string,
  panels: { id: string; kindId: string; customTitle?: string }[],
) {
  store.workspaces[id] = {
    id,
    name: id,
    folder: `/tmp/${id}`,
    createdAt: "2026-01-01T00:00:00Z",
    lastOpenedAt: "2026-01-01T00:00:00Z",
    terminals: [],
    editors: [],
    panels: panels.map((p) => ({
      ...p,
      workspaceId: id,
      state: {},
      createdAt: "2026-01-01T00:00:00Z",
      lastActiveAt: "2026-01-01T00:00:00Z",
    })),
  } as (typeof store.workspaces)[string];
}

function labels(items: ReturnType<typeof buildPanelTabMenuItems>): string[] {
  return items.map((i) => ("label" in i ? i.label : `--${i.type}--`));
}

afterEach(() => {
  for (const d of disposables.splice(0)) d.dispose();
  for (const id of Object.keys(store.workspaces)) delete store.workspaces[id];
  store.activeWorkspaceId = null;
});

describe("buildPanelTabMenuItems", () => {
  it("returns nothing for a panel id that isn't kind:id shaped", () => {
    expect(buildPanelTabMenuItems("nocolon")).toEqual([]);
    expect(buildPanelTabMenuItems(":orphan")).toEqual([]);
    expect(buildPanelTabMenuItems("kind:")).toEqual([]);
  });

  it("returns nothing when the kind's extension isn't installed", () => {
    expect(buildPanelTabMenuItems("ghost.kind:p1")).toEqual([]);
  });

  it("offers Rename… for a recorded kind without it declaring anything", () => {
    // The requirement in one test: a third-party panel inherits rename by being
    // recorded, never by being recognized.
    registerKind("third.party.chat", { persistence: "recorded" });
    addWorkspace("ws_1", [{ id: "p1", kindId: "third.party.chat" }]);
    expect(labels(buildPanelTabMenuItems("third.party.chat:p1"))).toEqual([
      "Rename…",
    ]);
  });

  it("does not offer Rename… for a transient kind", () => {
    registerKind("core.picker");
    expect(buildPanelTabMenuItems("core.picker:p1")).toEqual([]);
  });

  it("honours an explicit renamable flag in both directions", () => {
    registerKind("core.output", { persistence: "recorded", renamable: false });
    addWorkspace("ws_1", [{ id: "p1", kindId: "core.output" }]);
    expect(buildPanelTabMenuItems("core.output:p1")).toEqual([]);

    registerKind("core.scratch", { renamable: true });
    expect(labels(buildPanelTabMenuItems("core.scratch:p9"))).toEqual([
      "Rename…",
    ]);
  });

  it("finds the owning workspace even when it isn't the active one", () => {
    registerKind("silo.chat", { persistence: "recorded" });
    addWorkspace("ws_1", []);
    addWorkspace("ws_2", [{ id: "p2", kindId: "silo.chat" }]);
    store.activeWorkspaceId = "ws_1";
    expect(labels(buildPanelTabMenuItems("silo.chat:p2"))).toEqual(["Rename…"]);
  });
});

describe("contributions", () => {
  it("appends panel/tab entries behind a separator", () => {
    registerKind("silo.chat", { persistence: "recorded" });
    addWorkspace("ws_1", [{ id: "p1", kindId: "silo.chat" }]);
    disposables.push(
      registerContextMenuItem({
        id: "ext.probe",
        surface: "panel/tab",
        label: "Do A Thing",
        run: () => {},
      }),
    );
    expect(labels(buildPanelTabMenuItems("silo.chat:p1"))).toEqual([
      "Rename…",
      "--separator--",
      "Do A Thing",
    ]);
  });

  it("contributes to a tab with no rename, with no leading separator", () => {
    registerKind("core.picker");
    disposables.push(
      registerContextMenuItem({
        id: "ext.probe",
        surface: "panel/tab",
        label: "Do A Thing",
        run: () => {},
      }),
    );
    expect(labels(buildPanelTabMenuItems("core.picker:p1"))).toEqual([
      "Do A Thing",
    ]);
  });

  it("hands the contribution a target it can scope itself with", () => {
    registerKind("silo.chat", { persistence: "recorded" });
    addWorkspace("ws_2", [{ id: "p2", kindId: "silo.chat" }]);
    let seen: Record<string, unknown> | null = null;
    disposables.push(
      registerContextMenuItem({
        id: "ext.probe",
        surface: "panel/tab",
        label: "Probe",
        run: () => {},
        when: (_keys, target) => {
          seen = target as unknown as Record<string, unknown>;
          return true;
        },
      }),
    );
    buildPanelTabMenuItems("silo.chat:p2", { params: { profileId: "cursor" } });
    expect(seen).toEqual({
      panelId: "silo.chat:p2",
      kindId: "silo.chat",
      workspaceId: "ws_2",
      params: { profileId: "cursor" },
    });
  });

  it("hands over a copy of params, not the live dockview object", () => {
    registerKind("silo.chat", { persistence: "recorded" });
    addWorkspace("ws_1", [{ id: "p1", kindId: "silo.chat" }]);
    const live = { profileId: "cursor" };
    let seen: Record<string, unknown> | null = null;
    disposables.push(
      registerContextMenuItem({
        id: "ext.probe",
        surface: "panel/tab",
        label: "Probe",
        run: () => {},
        when: (_keys, target) => {
          seen = target as unknown as Record<string, unknown>;
          return true;
        },
      }),
    );
    buildPanelTabMenuItems("silo.chat:p1", { params: live });
    expect(seen!.params).not.toBe(live);
    expect(seen!.params).toEqual(live);
  });
});
