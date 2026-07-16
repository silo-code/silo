import { describe, it, expect, vi } from "vitest";
import {
  registerContextMenuItem,
  listContextMenuItems,
  onContextMenuItemsChange,
  buildContextMenuEntries,
} from "./context-menu-items";
import type {
  ContextKeys,
  ContextMenuContribution,
  MenuItem,
  Workspace,
} from "@silo-code/sdk";

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

// ── buildContextMenuEntries (pure builder) ──────────────────────────────────

const keys = {} as ContextKeys;
const wsTarget = { id: "ws_1", name: "One" } as Workspace;

function contribution(
  command: string,
  extra?: Partial<ContextMenuContribution<"workspace">>,
): ContextMenuContribution<"workspace"> {
  return { surface: "workspace", command, ...extra };
}

function build(
  items: ContextMenuContribution<"workspace">[],
  dispatch: (command: string, target: Workspace) => void = () => {},
) {
  return buildContextMenuEntries(
    items,
    keys,
    wsTarget,
    (c) => `label:${c}`,
    dispatch,
  );
}

function labels(entries: ReturnType<typeof build>): string[] {
  return entries.map((e) => ("label" in e ? e.label : "—"));
}

describe("buildContextMenuEntries", () => {
  it("hides items whose when returns false and keeps those without when", () => {
    const entries = build([
      contribution("a.show"),
      contribution("a.hide", { when: () => false }),
    ]);
    expect(labels(entries)).toEqual(["label:a.show"]);
  });

  it("passes keys and the target to when", () => {
    const when = vi.fn().mockReturnValue(true);
    build([contribution("a.x", { when })]);
    expect(when).toHaveBeenCalledWith(keys, wsTarget);
  });

  it("prefers the explicit label, falling back to resolveLabel", () => {
    const entries = build([
      contribution("a.explicit", { label: "Explicit" }),
      contribution("a.fallback"),
    ]);
    expect(labels(entries)).toEqual(["Explicit", "label:a.fallback"]);
  });

  it("separates groups, sorted lexically, with default group 9_default last", () => {
    const entries = build([
      contribution("a.default"), // no group → 9_default
      contribution("a.early", { group: "1_first" }),
    ]);
    expect(
      entries.map((e) => ("type" in e ? e.type : "label" in e ? e.label : "")),
    ).toEqual(["label:a.early", "separator", "label:a.default"]);
  });

  it("does not separate items within the same group and sorts them by order", () => {
    const entries = build([
      contribution("a.second", { group: "g", order: 2 }),
      contribution("a.first", { group: "g", order: 1 }),
    ]);
    expect(labels(entries)).toEqual(["label:a.first", "label:a.second"]);
  });

  it("evaluates checked per row and leaves it undefined when absent", () => {
    const entries = build([
      contribution("a.on", { checked: (_k, ws) => ws.id === "ws_1" }),
      contribution("a.plain"),
    ]) as MenuItem[];
    expect(entries[0].checked).toBe(true);
    expect(entries[1].checked).toBeUndefined();
  });

  it("dispatches the command with the target when a row runs", () => {
    const dispatch = vi.fn();
    const entries = build([contribution("a.run")], dispatch) as MenuItem[];
    entries[0].run?.();
    expect(dispatch).toHaveBeenCalledWith("a.run", wsTarget);
  });

  it("returns no leading separator when the first group is empty after when-filtering", () => {
    const entries = build([
      contribution("a.hidden", { group: "1_first", when: () => false }),
      contribution("a.visible", { group: "2_second" }),
    ]);
    expect(labels(entries)).toEqual(["label:a.visible"]);
  });
});
