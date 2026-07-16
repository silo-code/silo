import { describe, it, expect, vi } from "vitest";
import {
  registerContextMenuItem,
  listContextMenuItems,
  onContextMenuItemsChange,
} from "./context-menu-items";
import type { ContextMenuContribution, Workspace } from "@silo-code/sdk";

function workspaceItem(
  command: string,
  extra?: Partial<ContextMenuContribution<"workspace">>,
): ContextMenuContribution<"workspace"> {
  return { surface: "workspace", command, ...extra };
}

describe("context-menu-items registry", () => {
  it("lists a registered contribution under its surface", () => {
    const d = registerContextMenuItem(workspaceItem("acme.refresh"));
    try {
      expect(listContextMenuItems("workspace").map((c) => c.command)).toContain(
        "acme.refresh",
      );
    } finally {
      d.dispose();
    }
  });

  it("does not leak contributions across surfaces", () => {
    const d = registerContextMenuItem(workspaceItem("acme.wsOnly"));
    try {
      expect(
        listContextMenuItems("explorer/item").map((c) => c.command),
      ).not.toContain("acme.wsOnly");
    } finally {
      d.dispose();
    }
  });

  it("removes the contribution on dispose", () => {
    const d = registerContextMenuItem(workspaceItem("acme.gone"));
    d.dispose();
    expect(
      listContextMenuItems("workspace").map((c) => c.command),
    ).not.toContain("acme.gone");
  });

  it("dispose is idempotent and only notifies once", () => {
    const d = registerContextMenuItem(workspaceItem("acme.once"));
    const fn = vi.fn();
    const sub = onContextMenuItemsChange(fn);
    d.dispose();
    d.dispose();
    expect(fn).toHaveBeenCalledTimes(1);
    sub.dispose();
  });

  it("preserves registration order within a surface", () => {
    const d1 = registerContextMenuItem(workspaceItem("acme.first"));
    const d2 = registerContextMenuItem(workspaceItem("acme.second"));
    try {
      const commands = listContextMenuItems("workspace").map((c) => c.command);
      expect(commands.indexOf("acme.first")).toBeLessThan(
        commands.indexOf("acme.second"),
      );
    } finally {
      d1.dispose();
      d2.dispose();
    }
  });

  it("notifies on register and stops after unsubscribe", () => {
    const fn = vi.fn();
    const sub = onContextMenuItemsChange(fn);
    const d1 = registerContextMenuItem(workspaceItem("acme.notify"));
    expect(fn).toHaveBeenCalledTimes(1);
    sub.dispose();
    const d2 = registerContextMenuItem(workspaceItem("acme.silent"));
    expect(fn).toHaveBeenCalledTimes(1);
    d1.dispose();
    d2.dispose();
  });

  it("carries when/checked predicates through to the listed entry", () => {
    const checked = (_ctx: unknown, ws: Workspace) => ws.id === "ws_1";
    const d = registerContextMenuItem(
      workspaceItem("acme.toggle", {
        checked: checked as ContextMenuContribution<"workspace">["checked"],
        group: "acme",
        order: 2,
      }),
    );
    try {
      const entry = listContextMenuItems("workspace").find(
        (c) => c.command === "acme.toggle",
      );
      expect(entry?.group).toBe("acme");
      expect(entry?.order).toBe(2);
      expect(entry?.checked).toBe(checked);
    } finally {
      d.dispose();
    }
  });
});
