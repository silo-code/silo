import { describe, it, expect } from "vitest";
import { buildNavItems } from "./workspace-nav";

const openAll = () => true;

describe("buildNavItems", () => {
  it("lists ungrouped workspaces in panel order", () => {
    const items = buildNavItems(["a", "b", "c"], {}, openAll);
    expect(items).toEqual([
      { kind: "workspace", id: "a" },
      { kind: "workspace", id: "b" },
      { kind: "workspace", id: "c" },
    ]);
  });

  it("expands a group as its header followed by its members", () => {
    const items = buildNavItems(
      ["grp_1", "z"],
      { grp_1: { collapsed: false, workspaceOrder: ["a", "b"] } },
      openAll,
    );
    expect(items).toEqual([
      { kind: "group", id: "grp_1" },
      { kind: "workspace", id: "a" },
      { kind: "workspace", id: "b" },
      { kind: "workspace", id: "z" },
    ]);
  });

  it("keeps a collapsed group's header but omits its (hidden) members", () => {
    const items = buildNavItems(
      ["grp_1", "z"],
      { grp_1: { collapsed: true, workspaceOrder: ["a", "b"] } },
      openAll,
    );
    expect(items).toEqual([
      { kind: "group", id: "grp_1" },
      { kind: "workspace", id: "z" },
    ]);
  });

  it("interleaves groups and ungrouped entries in panel order", () => {
    const items = buildNavItems(
      ["top", "grp_1", "bottom"],
      { grp_1: { collapsed: false, workspaceOrder: ["a"] } },
      openAll,
    );
    expect(items.map((i) => i.id)).toEqual(["top", "grp_1", "a", "bottom"]);
  });

  it("filters out closed/stale ids (ungrouped and grouped) but keeps the group header", () => {
    const open = new Set(["a", "grp_1"]);
    const items = buildNavItems(
      ["a", "gone", "grp_1"],
      { grp_1: { collapsed: false, workspaceOrder: ["a", "closed"] } },
      (id) => open.has(id),
    );
    expect(items).toEqual([
      { kind: "workspace", id: "a" },
      { kind: "group", id: "grp_1" },
      { kind: "workspace", id: "a" },
    ]);
  });

  it("omits a closed group's header and its members entirely", () => {
    const items = buildNavItems(
      ["top", "grp_1", "bottom"],
      {
        grp_1: {
          collapsed: false,
          workspaceOrder: ["a", "b"],
          closedAt: "2026-01-01T00:00:00.000Z",
        },
      },
      openAll,
    );
    expect(items).toEqual([
      { kind: "workspace", id: "top" },
      { kind: "workspace", id: "bottom" },
    ]);
  });

  it("still renders an open group next to a closed one, in panel order", () => {
    const items = buildNavItems(
      ["grp_closed", "grp_open"],
      {
        grp_closed: {
          collapsed: false,
          workspaceOrder: ["a"],
          closedAt: "2026-01-01T00:00:00.000Z",
        },
        grp_open: { collapsed: false, workspaceOrder: ["b"] },
      },
      openAll,
    );
    expect(items).toEqual([
      { kind: "group", id: "grp_open" },
      { kind: "workspace", id: "b" },
    ]);
  });

  it("yields sequential indices matching render order (via the resulting map)", () => {
    const items = buildNavItems(
      ["grp_1", "solo"],
      { grp_1: { collapsed: false, workspaceOrder: ["a", "b"] } },
      openAll,
    );
    const index = new Map(items.map((it, i) => [it.id, i]));
    expect(index.get("grp_1")).toBe(0);
    expect(index.get("a")).toBe(1);
    expect(index.get("b")).toBe(2);
    expect(index.get("solo")).toBe(3);
  });
});
