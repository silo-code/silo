import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { MenuItem } from "@silo-code/sdk";
import { store } from "../state/store";
import {
  buildWorkspaceMenuItems,
  confirmAndCloseWorkspace,
} from "./workspace-menu";
import { commandRegistry } from "./commands";
import { registerContextMenuItem } from "./context-menu-items";
import { getGlobalExtensionStorage } from "./extension-storage";
import { getUiService } from "./ui-service";

const disposables: { dispose(): void }[] = [];
const workspacesStorage = getGlobalExtensionStorage("core.workspaces");

function addWorkspace(id: string, over: Record<string, unknown> = {}) {
  store.workspaces[id] = {
    id,
    name: id,
    folder: `/tmp/${id}`,
    createdAt: "2026-01-01T00:00:00Z",
    lastOpenedAt: "2026-01-01T00:00:00Z",
    terminals: [],
    editors: [],
    ...over,
  } as (typeof store.workspaces)[string];
}

function labels(items: ReturnType<typeof buildWorkspaceMenuItems>): string[] {
  return items.map((i) => ("label" in i ? i.label : `--${i.type}--`));
}

beforeEach(() => {
  disposables.push(
    commandRegistry.register({
      id: "workspace.properties",
      label: "Workspace Properties…",
      run: () => {},
    }),
  );
});

afterEach(() => {
  for (const d of disposables.splice(0)) d.dispose();
  for (const id of Object.keys(store.workspaces)) delete store.workspaces[id];
  workspacesStorage.set("closeWorkspace.dontShowAgain", undefined);
  vi.restoreAllMocks();
});

describe("buildWorkspaceMenuItems", () => {
  it("returns nothing for an unknown workspace", () => {
    expect(buildWorkspaceMenuItems("nope")).toEqual([]);
  });

  it("offers Properties… and Close for an open workspace", () => {
    addWorkspace("ws_1");
    expect(labels(buildWorkspaceMenuItems("ws_1"))).toEqual([
      "Properties…",
      "Close",
    ]);
  });

  it("drops Close for a closed workspace", () => {
    addWorkspace("ws_1", { closedAt: "2026-02-01T00:00:00Z" });
    expect(labels(buildWorkspaceMenuItems("ws_1"))).toEqual(["Properties…"]);
  });

  it("omits Properties… when nothing registered the command", () => {
    // core.workspaces ships it, but the row shouldn't be a dead end if the
    // command is ever missing.
    for (const d of disposables.splice(0)) d.dispose();
    addWorkspace("ws_1");
    expect(labels(buildWorkspaceMenuItems("ws_1"))).toEqual(["Close"]);
  });

  it("dispatches the properties command with the workspace id", () => {
    for (const d of disposables.splice(0)) d.dispose();
    const run = vi.fn();
    disposables.push(
      commandRegistry.register({
        id: "workspace.properties",
        label: "Workspace Properties…",
        run,
      }),
    );
    addWorkspace("ws_1");
    const item = buildWorkspaceMenuItems("ws_1")[0] as MenuItem;
    item.run?.();
    expect(run).toHaveBeenCalledWith("ws_1");
  });
});

describe("extra rows", () => {
  it("slots them directly below Properties…", () => {
    addWorkspace("ws_1");
    const items = buildWorkspaceMenuItems("ws_1", [
      { label: "Move to Group", run: () => {} },
    ]);
    expect(labels(items)).toEqual(["Properties…", "Move to Group", "Close"]);
  });

  it("leads with them when Properties… is unavailable", () => {
    for (const d of disposables.splice(0)) d.dispose();
    addWorkspace("ws_1");
    const items = buildWorkspaceMenuItems("ws_1", [
      { label: "Move to Group", run: () => {} },
    ]);
    expect(labels(items)).toEqual(["Move to Group", "Close"]);
  });
});

describe("contributions", () => {
  it("appends workspace-surface entries behind a separator", () => {
    addWorkspace("ws_1");
    disposables.push(
      registerContextMenuItem({
        id: "ext.clear",
        surface: "workspace",
        label: "Clear Alerts",
        run: () => {},
      }),
    );
    expect(labels(buildWorkspaceMenuItems("ws_1"))).toEqual([
      "Properties…",
      "Close",
      "--separator--",
      "Clear Alerts",
    ]);
  });
});

describe("confirmAndCloseWorkspace", () => {
  it("closes without a dialog once dontShowAgain is set", async () => {
    addWorkspace("ws_1");
    workspacesStorage.set("closeWorkspace.dontShowAgain", true);
    const showModal = vi.spyOn(getUiService(), "showModal");

    await confirmAndCloseWorkspace("ws_1", "ws_1");

    expect(showModal).not.toHaveBeenCalled();
    expect(store.workspaces.ws_1?.closedAt).toBeTruthy();
  });

  it("leaves the workspace open when the dialog is cancelled", async () => {
    addWorkspace("ws_1");
    vi.spyOn(getUiService(), "showModal").mockResolvedValue(false);

    await confirmAndCloseWorkspace("ws_1", "ws_1");

    expect(store.workspaces.ws_1?.closedAt).toBeFalsy();
  });
});
