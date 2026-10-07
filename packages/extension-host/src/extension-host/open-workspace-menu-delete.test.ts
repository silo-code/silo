import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { MenuEntry, MenuItem } from "@silo-code/sdk";
import { store } from "../state/store";
import { buildOpenWorkspaceItems } from "./open-workspace-menu";
import { closeMenu, getMenu, openMenu } from "./menu-controller";
import { getGlobalExtensionStorage } from "./extension-storage";
import { closeGroup, createGroup } from "../state/workspaces";

vi.mock("./terminal-service", () => ({
  reapWorkspaceTerminals: vi.fn(),
}));

vi.mock("./file-service", () => ({
  getFileService: () => ({
    pathExists: vi.fn().mockResolvedValue(true),
  }),
}));

import { reapWorkspaceTerminals } from "./terminal-service";

const workspacesStorage = getGlobalExtensionStorage("core.workspaces");

function addClosedWorkspace(id: string) {
  store.workspaces[id] = {
    id,
    name: id,
    folder: `/tmp/${id}`,
    createdAt: "2026-01-01T00:00:00Z",
    lastOpenedAt: "2026-01-01T00:00:00Z",
    closedAt: "2026-02-01T00:00:00Z",
    terminals: [],
    editors: [],
  } as (typeof store.workspaces)[string];
}

function trailingDelete(items: ReturnType<typeof buildOpenWorkspaceItems>) {
  const row = items.find(
    (item): item is MenuItem => !("type" in item) && item.label === "solo",
  );
  expect(row?.trailing?.onClick).toBeTruthy();
  return row!.trailing!.onClick;
}

beforeEach(() => {
  closeMenu();
  workspacesStorage.set("deleteWorkspace.dontShowAgain", true);
  workspacesStorage.set("deleteGroup.dontShowAgain", true);
  vi.mocked(reapWorkspaceTerminals).mockClear();
});

afterEach(() => {
  store.workspaces = {};
  store.workspaceOrder = [];
  store.groups = {};
  store.panelOrder = [];
  workspacesStorage.set("deleteWorkspace.dontShowAgain", undefined);
  workspacesStorage.set("deleteGroup.dontShowAgain", undefined);
  closeMenu();
  vi.restoreAllMocks();
});

describe("open workspace menu delete", () => {
  it("removes the workspace and closes the open menu", async () => {
    addClosedWorkspace("solo");
    const items = buildOpenWorkspaceItems({
      closed: [
        {
          id: "solo",
          name: "solo",
          folder: "/tmp/solo",
          createdAt: "2026-01-01T00:00:00Z",
          lastOpenedAt: "2026-01-01T00:00:00Z",
          closedAt: "2026-02-01T00:00:00Z",
          terminals: [],
          editors: [],
        },
      ],
      folderExistence: new Map(),
      onNew: () => {},
    });
    void openMenu({ items, anchor: document.createElement("button") });
    expect(getMenu()).not.toBeNull();

    trailingDelete(items)();
    await vi.waitFor(() => {
      expect(store.workspaces.solo).toBeUndefined();
    });

    expect(reapWorkspaceTerminals).toHaveBeenCalledWith("solo");
    expect(getMenu()).toBeNull();
  });

  it("keeps the menu open and refreshes its rows after a delete when a refresh is registered", async () => {
    addClosedWorkspace("solo");
    const items = buildOpenWorkspaceItems({
      closed: [
        {
          id: "solo",
          name: "solo",
          folder: "/tmp/solo",
          createdAt: "2026-01-01T00:00:00Z",
          lastOpenedAt: "2026-01-01T00:00:00Z",
          closedAt: "2026-02-01T00:00:00Z",
          terminals: [],
          editors: [],
        },
      ],
      folderExistence: new Map(),
      onNew: () => {},
    });
    // A fresh list after the delete drops the just-removed row (here: empty saved).
    const refreshedItems: MenuEntry[] = [
      { type: "header", label: "Saved" },
      { label: "No existing workspaces", disabled: true, run: () => {} },
    ];
    let refreshedCount = 0;
    void openMenu({
      items,
      anchor: document.createElement("button"),
      refresh: () => {
        refreshedCount++;
        return refreshedItems;
      },
    });
    expect(getMenu()).not.toBeNull();

    trailingDelete(items)();
    await vi.waitFor(() => {
      expect(store.workspaces.solo).toBeUndefined();
    });

    expect(reapWorkspaceTerminals).toHaveBeenCalledWith("solo");
    // The menu stayed open and swapped in the refreshed rows in place.
    expect(refreshedCount).toBe(1);
    expect(getMenu()?.items).toBe(refreshedItems);
  });

  it("re-resolves the rows from the live store after a delete so back-to-back deletes work", async () => {
    addClosedWorkspace("solo");
    const buildItems = (closed: string[]) =>
      buildOpenWorkspaceItems({
        closed: closed.map((id) => ({
          id,
          name: id,
          folder: `/tmp/${id}`,
          createdAt: "2026-01-01T00:00:00Z",
          lastOpenedAt: "2026-01-01T00:00:00Z",
          closedAt: "2026-02-01T00:00:00Z",
          terminals: [],
          editors: [],
        })),
        folderExistence: new Map(),
        onNew: () => {},
      });
    // Mirror the live menu: refresh derives its rows from the current store.
    const derive = () =>
      buildItems(
        Object.values(store.workspaces)
          .filter((w) => w.closedAt)
          .map((w) => w.id),
      );
    void openMenu({
      items: derive(),
      anchor: document.createElement("button"),
      refresh: derive,
    });

    trailingDelete(derive())();
    await vi.waitFor(() => {
      expect(store.workspaces.solo).toBeUndefined();
    });
    // The delete dropped the row and the menu stayed open with the pruned list.
    const labels = getMenu()
      ?.items.map((i) => (!("type" in i) ? i.label : null))
      .filter((l): l is string => Boolean(l));
    expect(labels).not.toContain("solo");
    expect(labels).toContain("No existing workspaces");
    expect(getMenu()).not.toBeNull();
  });

  it("removes the group and closes the open menu", async () => {
    const group = createGroup("Group");
    closeGroup(group.id);
    const items = buildOpenWorkspaceItems({
      closed: [],
      closedGroups: [
        {
          id: group.id,
          name: "Group",
          memberCount: 0,
          closedAt: "2026-02-01T00:00:00Z",
        },
      ],
      folderExistence: new Map(),
      onNew: () => {},
    });
    void openMenu({ items, anchor: document.createElement("button") });

    const row = items.find(
      (item): item is MenuItem => !("type" in item) && item.label === "Group",
    );
    row?.trailing?.onClick();
    await vi.waitFor(() => {
      expect(store.groups[group.id]).toBeUndefined();
    });

    expect(getMenu()).toBeNull();
  });
});
