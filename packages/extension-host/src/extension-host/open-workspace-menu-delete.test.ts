import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { MenuItem } from "@silo-code/sdk";
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
