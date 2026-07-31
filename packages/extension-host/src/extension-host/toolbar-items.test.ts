import { beforeEach, describe, expect, it, vi } from "vitest";
import { commandRegistry } from "./commands";
import {
  _resetToolbarItemsForTests,
  collapseToolbarChrome,
  registerToolbarItem,
  toolbarEntriesFor,
  type ToolbarEntry,
} from "./toolbar-items";

function control(entry: ToolbarEntry | undefined) {
  if (!entry || entry.kind === "separator" || entry.kind === "spacer") {
    throw new Error(`expected control, got ${entry?.kind}`);
  }
  return entry;
}

describe("toolbar items", () => {
  beforeEach(() => {
    _resetToolbarItemsForTests();
  });

  it("filters by surface and sorts by order", () => {
    commandRegistry.register({ id: "demo.a", label: "A", run: () => {} });
    commandRegistry.register({ id: "demo.b", label: "B", run: () => {} });

    const d1 = registerToolbarItem({
      id: "late",
      surface: "editor",
      command: "demo.a",
      order: 10,
    });
    const d2 = registerToolbarItem({
      id: "early",
      surface: "editor",
      command: "demo.b",
      order: 1,
    });
    const d3 = registerToolbarItem({
      id: "term",
      surface: "terminal",
      command: "demo.a",
    });

    expect(
      toolbarEntriesFor("editor", { editorId: "ed_1" }).map((e) => e.id),
    ).toEqual(["early", "late"]);
    expect(
      toolbarEntriesFor("terminal", { terminalId: "t1" }).map((e) => e.id),
    ).toEqual(["term"]);

    d1.dispose();
    d2.dispose();
    d3.dispose();
  });

  it("hides when when() returns false and surfaces checked", () => {
    commandRegistry.register({
      id: "demo.toggle",
      label: "Toggle",
      run: () => {},
    });
    const d = registerToolbarItem({
      id: "tog",
      surface: "editor",
      command: "demo.toggle",
      when: (_k, t) => t.editorId === "ed_yes",
      checked: (_k, t) => t.editorId === "ed_yes",
    });

    expect(toolbarEntriesFor("editor", { editorId: "ed_no" })).toEqual([]);
    const yes = control(toolbarEntriesFor("editor", { editorId: "ed_yes" })[0]);
    expect(yes.checked).toBe(true);
    expect(yes.kind).toBe("command");

    d.dispose();
  });

  it("exposes title for text / icon+text chrome", () => {
    commandRegistry.register({
      id: "demo.mark",
      label: "Mark cmd",
      run: () => {},
    });
    const d = registerToolbarItem({
      id: "texty",
      surface: "editor",
      command: "demo.mark",
      title: "Mark",
      icon: "Flag",
    });

    const entry = control(toolbarEntriesFor("editor", { editorId: "ed_1" })[0]);
    expect(entry.title).toBe("Mark");
    expect(entry.label).toBe("Mark");
    expect(entry.icon).toBe("Flag");

    d.dispose();
  });

  it("resolves menu contributions and rejects command+menu / neither", () => {
    const d = registerToolbarItem({
      id: "drop",
      surface: "editor",
      title: "More",
      menu: (t) => [
        { label: `For ${t.editorId}`, run: () => {} },
        { type: "separator" },
        { label: "Nope", disabled: true, run: () => {} },
      ],
    });

    const entry = control(toolbarEntriesFor("editor", { editorId: "ed_9" })[0]);
    expect(entry.kind).toBe("menu");
    expect(entry.title).toBe("More");
    expect(entry.checked).toBeUndefined();
    expect(entry.loadMenu()).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "For ed_9" })]),
    );

    d.dispose();

    expect(() =>
      registerToolbarItem({
        id: "both",
        surface: "editor",
        command: "x",
        menu: () => [],
      } as never),
    ).toThrow(/exactly one of command or menu/);

    expect(() =>
      registerToolbarItem({
        id: "neither",
        surface: "editor",
      } as never),
    ).toThrow(/exactly one of command or menu/);
  });

  it("runCommand invokes the registered command with the target", () => {
    const run = vi.fn();
    commandRegistry.register({ id: "demo.run", label: "Run", run });
    const d = registerToolbarItem({
      id: "run",
      surface: "terminal",
      command: "demo.run",
    });

    control(
      toolbarEntriesFor("terminal", { terminalId: "t42" })[0],
    ).runCommand();
    expect(run).toHaveBeenCalledWith({ terminalId: "t42" });

    d.dispose();
  });

  it("inserts separators and spacers, collapsing adjacent / edge chrome", () => {
    commandRegistry.register({ id: "demo.sep.a", label: "A", run: () => {} });
    commandRegistry.register({ id: "demo.sep.b", label: "B", run: () => {} });

    const disposables = [
      registerToolbarItem({
        type: "separator",
        id: "lead-sep",
        surface: "editor",
        order: 0,
      }),
      registerToolbarItem({
        id: "a",
        surface: "editor",
        command: "demo.sep.a",
        order: 10,
      }),
      registerToolbarItem({
        type: "separator",
        id: "sep-1",
        surface: "editor",
        order: 20,
      }),
      registerToolbarItem({
        type: "separator",
        id: "sep-2",
        surface: "editor",
        order: 21,
      }),
      registerToolbarItem({
        type: "spacer",
        id: "gap-sm",
        surface: "editor",
        size: "sm",
        order: 30,
      }),
      registerToolbarItem({
        type: "spacer",
        id: "gap-lg",
        surface: "editor",
        size: "lg",
        order: 31,
      }),
      registerToolbarItem({
        id: "b",
        surface: "editor",
        command: "demo.sep.b",
        order: 40,
      }),
      registerToolbarItem({
        type: "spacer",
        id: "trail",
        surface: "editor",
        order: 50,
      }),
    ];

    expect(
      toolbarEntriesFor("editor", { editorId: "ed_1" }).map((e) =>
        e.kind === "spacer"
          ? `${e.kind}:${e.size}`
          : e.kind === "separator"
            ? e.kind
            : e.id,
      ),
    ).toEqual(["a", "separator", "spacer:lg", "b"]);

    for (const d of disposables) d.dispose();
  });

  it("collapseToolbarChrome merges adjacent spacers to the larger size", () => {
    expect(
      collapseToolbarChrome([
        {
          id: "a",
          kind: "command",
          label: "A",
          tooltip: "A",
          runCommand: () => {},
          loadMenu: () => [],
        },
        { id: "s1", kind: "spacer", size: "sm" },
        { id: "s2", kind: "spacer", size: "lg" },
        {
          id: "b",
          kind: "command",
          label: "B",
          tooltip: "B",
          runCommand: () => {},
          loadMenu: () => [],
        },
      ]).map((e) => (e.kind === "spacer" ? e.size : e.id)),
    ).toEqual(["a", "lg", "b"]);
  });
});
