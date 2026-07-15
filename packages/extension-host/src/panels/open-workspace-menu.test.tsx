import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Workspace } from "@silo-code/sdk";

vi.mock("../extension-host/workspace-service", () => ({
  getWorkspaceService: () => ({
    activate: vi.fn(),
    delete: vi.fn(),
  }),
}));

vi.mock("../extension-host/ui-service", () => ({
  getUiService: () => ({
    confirm: vi.fn(),
  }),
}));

vi.mock("../extension-host/terminal-service", () => ({
  getTerminalService: () => ({
    closeWorkspace: vi.fn(),
  }),
}));

vi.mock("../extension-host/file-service", () => ({
  getFileService: () => ({
    pathExists: vi.fn(),
  }),
}));

vi.mock("../state/workspaces", () => ({
  deleteGroup: vi.fn(),
  restoreGroup: vi.fn(),
}));

import { buildOpenWorkspaceItems } from "../panels/open-workspace-menu";

function ws(id: string): Workspace {
  return {
    id,
    name: id,
    folder: `/tmp/${id}`,
    createdAt: "2025-01-01T00:00:00.000Z",
    lastOpenedAt: "2025-01-01T00:00:00.000Z",
    closedAt: "2026-01-01T00:00:00.000Z",
    terminals: [],
    editors: [],
  };
}

function labels(items: ReturnType<typeof buildOpenWorkspaceItems>): string[] {
  return items.map((item) => {
    if ("type" in item && item.type === "separator") return "---";
    if ("type" in item && item.type === "header") return `header:${item.label}`;
    return "label" in item ? item.label : "?";
  });
}

describe("buildOpenWorkspaceItems", () => {
  const onNew = vi.fn();
  const onNewGroup = vi.fn();

  beforeEach(() => {
    onNew.mockClear();
    onNewGroup.mockClear();
  });

  it("lists closed groups above individual workspaces, then New rows", () => {
    const items = buildOpenWorkspaceItems({
      closed: [ws("solo")],
      closedGroups: [
        {
          id: "grp_1",
          name: "Xerro",
          memberCount: 2,
          closedAt: "2026-02-01T00:00:00.000Z",
        },
      ],
      folderExistence: new Map(),
      onNew,
      onNewGroup,
    });
    expect(labels(items)).toEqual([
      "header:Saved",
      "Xerro",
      "solo",
      "---",
      "New workspace…",
      "New Group…",
    ]);
  });

  it("omits New Group when onNewGroup is not provided", () => {
    const items = buildOpenWorkspaceItems({
      closed: [ws("solo")],
      folderExistence: new Map(),
      onNew,
    });
    expect(labels(items)).toEqual([
      "header:Saved",
      "solo",
      "---",
      "New workspace…",
    ]);
  });

  it("shows a disabled empty row when nothing is saved", () => {
    const items = buildOpenWorkspaceItems({
      closed: [],
      closedGroups: [],
      folderExistence: new Map(),
      onNew,
      onNewGroup,
    });
    expect(labels(items)).toEqual([
      "header:Saved",
      "No existing workspaces",
      "---",
      "New workspace…",
      "New Group…",
    ]);
    const empty = items[1];
    expect(empty && "disabled" in empty && empty.disabled).toBe(true);
  });
});
