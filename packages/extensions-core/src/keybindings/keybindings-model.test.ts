import { describe, it, expect } from "vitest";
import type { Command, MenuId } from "@silo-code/sdk";
import {
  bindingsAfterRemove,
  bindingsAfterReset,
  bindingsAfterSet,
  commandMatchesQuery,
  conflictingCommands,
  groupCommands,
  groupFor,
  humanize,
  parseCaptureKeydown,
  rowState,
} from "./keybindings-model";

function cmd(id: string, label = id): Command {
  return { id, label, run: () => {} };
}

describe("humanize", () => {
  it("splits camelCase into words", () => {
    expect(humanize("webviewBridgeTest")).toBe("Webview Bridge Test");
  });

  it("splits kebab-case into words", () => {
    expect(humanize("file-search")).toBe("File Search");
  });

  it("title-cases a single word", () => {
    expect(humanize("git")).toBe("Git");
  });
});

describe("groupFor", () => {
  const noMenu = (): MenuId | undefined => undefined;

  it("uses the first segment for a non-core/silo namespace", () => {
    expect(groupFor(cmd("workspace.new"), noMenu)).toBe("Workspace");
    expect(groupFor(cmd("settings.close"), noMenu)).toBe("Settings");
  });

  it("uses the sub-namespace for core/silo ids with 3+ segments", () => {
    expect(groupFor(cmd("silo.git.manageWorktrees"), noMenu)).toBe("Git");
    expect(groupFor(cmd("silo.file-search.findInFiles"), noMenu)).toBe(
      "File Search",
    );
    expect(groupFor(cmd("core.updates.check"), noMenu)).toBe("Updates");
  });

  it("labels the cli sub-namespace as CLI", () => {
    expect(groupFor(cmd("core.cli.install"), noMenu)).toBe("CLI");
  });

  it("falls back to the command's menu placement for flat core/silo ids", () => {
    const menuFor = (id: string): MenuId | undefined =>
      id === "core.save" ? "file" : undefined;
    expect(groupFor(cmd("core.save"), menuFor)).toBe("File");
  });

  it("falls back to General for flat core/silo ids with no menu item", () => {
    expect(groupFor(cmd("core.nextTab"), noMenu)).toBe("General");
  });
});

describe("groupCommands", () => {
  const noMenu = (): MenuId | undefined => undefined;

  it("buckets commands by group and sorts groups alphabetically", () => {
    const commands = [
      cmd("workspace.new", "New Workspace"),
      cmd("silo.git.manageWorktrees", "Manage Worktrees"),
      cmd("workspace.close", "Close Workspace"),
    ];
    const groups = groupCommands(commands, noMenu);
    expect(groups.map(([name]) => name)).toEqual(["Git", "Workspace"]);
    expect(groups[1][1].map((c) => c.id)).toEqual([
      "workspace.new",
      "workspace.close",
    ]);
  });

  it("always sorts the General bucket last among ordinary groups", () => {
    const commands = [cmd("core.nextTab"), cmd("workspace.new")];
    const groups = groupCommands(commands, noMenu);
    expect(groups.map(([name]) => name)).toEqual(["Workspace", "General"]);
  });

  it("pins CLI after General", () => {
    const commands = [
      cmd("core.cli.install", "Install silo"),
      cmd("core.nextTab"),
      cmd("workspace.new"),
    ];
    const groups = groupCommands(commands, noMenu);
    expect(groups.map(([name]) => name)).toEqual([
      "Workspace",
      "General",
      "CLI",
    ]);
  });

  it("returns no groups for an empty command list", () => {
    expect(groupCommands([], noMenu)).toEqual([]);
  });
});

describe("rowState", () => {
  it("reports unbound when the user removed the keybinding", () => {
    expect(
      rowState({ unbound: true, defaultKey: "cmd+s", effectiveKey: undefined }),
    ).toBe("unbound");
  });

  it("reports override when an override key is present", () => {
    expect(
      rowState({
        unbound: false,
        overrideKey: "cmd+shift+s",
        defaultKey: "cmd+s",
        effectiveKey: "cmd+shift+s",
      }),
    ).toBe("override");
  });

  it("reports default when only a default applies", () => {
    expect(
      rowState({
        unbound: false,
        defaultKey: "cmd+s",
        effectiveKey: "cmd+s",
      }),
    ).toBe("default");
  });

  it("reports none when the command has never had a key", () => {
    expect(rowState({ unbound: false })).toBe("none");
  });
});

describe("parseCaptureKeydown", () => {
  it("cancels on Escape", () => {
    expect(
      parseCaptureKeydown(
        {
          key: "Escape",
          code: "Escape",
          metaKey: false,
          ctrlKey: false,
          altKey: false,
          shiftKey: false,
        },
        { confirming: false },
      ),
    ).toEqual({ kind: "cancel" });
  });

  it("confirms on Enter only while confirming a reassign", () => {
    const enter = {
      key: "Enter",
      code: "Enter",
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
    };
    expect(parseCaptureKeydown(enter, { confirming: true })).toEqual({
      kind: "confirm",
    });
    expect(parseCaptureKeydown(enter, { confirming: false })).toEqual({
      kind: "chord",
      key: "enter",
    });
  });

  it("ignores modifier-only presses", () => {
    expect(
      parseCaptureKeydown(
        {
          key: "Meta",
          code: "MetaLeft",
          metaKey: true,
          ctrlKey: false,
          altKey: false,
          shiftKey: false,
        },
        { confirming: false },
      ),
    ).toEqual({ kind: "ignore" });
  });

  it("builds a normalized chord from modifiers + key", () => {
    expect(
      parseCaptureKeydown(
        {
          key: "s",
          code: "KeyS",
          metaKey: true,
          ctrlKey: false,
          altKey: false,
          shiftKey: true,
        },
        { confirming: false },
      ),
    ).toEqual({ kind: "chord", key: "cmd+shift+s" });
  });
});

describe("conflictingCommands", () => {
  it("lists other commands that hold the same effective key", () => {
    expect(
      conflictingCommands("cmd+s", "file.saveAs", [
        { command: "file.save", effectiveKey: "cmd+s" },
        { command: "file.saveAs", effectiveKey: "cmd+shift+s" },
        { command: "edit.copy", effectiveKey: "cmd+c" },
      ]),
    ).toEqual(["file.save"]);
  });
});

describe("bindingsAfterSet / Reset / Remove", () => {
  const defaults = new Map([
    ["file.save", "cmd+s"],
    ["file.saveAs", "cmd+shift+s"],
  ]);

  it("sets an override and leaves others alone", () => {
    expect(
      bindingsAfterSet([], "file.save", "cmd+alt+s", [], defaults),
    ).toEqual([{ command: "file.save", key: "cmd+alt+s" }]);
  });

  it("reassigns by unbinding a default holder of the chord", () => {
    expect(
      bindingsAfterSet([], "file.saveAs", "cmd+s", ["file.save"], defaults),
    ).toEqual([
      { command: "file.saveAs", key: "cmd+s" },
      { command: "-file.save", key: "" },
    ]);
  });

  it("reassigns by dropping another command's override when that was the key", () => {
    const current = [{ command: "file.save", key: "cmd+k" }];
    expect(
      bindingsAfterSet(
        current,
        "file.saveAs",
        "cmd+k",
        ["file.save"],
        defaults,
      ),
    ).toEqual([{ command: "file.saveAs", key: "cmd+k" }]);
  });

  it("reassigns by unbinding when the override equals the victim default", () => {
    const current = [{ command: "file.save", key: "cmd+s" }];
    expect(
      bindingsAfterSet(
        current,
        "file.saveAs",
        "cmd+s",
        ["file.save"],
        defaults,
      ),
    ).toEqual([
      { command: "file.saveAs", key: "cmd+s" },
      { command: "-file.save", key: "" },
    ]);
  });

  it("resets by clearing override and unbind entries", () => {
    const current = [
      { command: "file.save", key: "cmd+k" },
      { command: "-file.saveAs", key: "" },
    ];
    expect(bindingsAfterReset(current, "file.save")).toEqual([
      { command: "-file.saveAs", key: "" },
    ]);
    expect(bindingsAfterReset(current, "file.saveAs")).toEqual([
      { command: "file.save", key: "cmd+k" },
    ]);
  });

  it("removes by writing an unbind entry", () => {
    expect(bindingsAfterRemove([], "file.save")).toEqual([
      { command: "-file.save", key: "" },
    ]);
    expect(
      bindingsAfterRemove(
        [{ command: "file.save", key: "cmd+k" }],
        "file.save",
      ),
    ).toEqual([{ command: "-file.save", key: "" }]);
  });
});

describe("commandMatchesQuery", () => {
  const save = { id: "file.save", label: "Save File" };

  it("matches label and id", () => {
    expect(commandMatchesQuery("save", save, {})).toBe(true);
    expect(commandMatchesQuery("file.save", save, {})).toBe(true);
    expect(commandMatchesQuery("xyz", save, {})).toBe(false);
  });

  it("matches effective and display keys", () => {
    expect(
      commandMatchesQuery("cmd+s", save, {
        effective: "cmd+s",
        display: "Cmd+S",
      }),
    ).toBe(true);
    expect(
      commandMatchesQuery("cmd+s", save, {
        effective: "cmd+s",
        display: "Cmd+S",
      }),
    ).toBe(true);
    expect(
      commandMatchesQuery("Cmd+S", save, {
        effective: "cmd+s",
        display: "Cmd+S",
      }),
    ).toBe(true);
  });

  it("matches empty query as everything", () => {
    expect(commandMatchesQuery("", save, {})).toBe(true);
  });
});
