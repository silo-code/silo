import { describe, it, expect } from "vitest";
import type { AgentCommand } from "@silo-code/sdk";
import {
  clampPaletteIndex,
  commandDisplayTitle,
  commandQueryFromDraft,
  draftAfterCommandPick,
  filterCommands,
  RESERVED_CLEAR,
  clearShortcutLabel,
  isClearShortcut,
  isReservedDraft,
  paletteNavAction,
  stepPaletteIndex,
  withReservedCommands,
} from "./command-palette";

describe("commandQueryFromDraft", () => {
  it("reads the name being typed after a leading slash", () => {
    expect(commandQueryFromDraft("/comp")).toBe("comp");
    expect(commandQueryFromDraft("/")).toBe("");
  });

  it("stops once a space follows — that's the argument, not the name", () => {
    expect(commandQueryFromDraft("/compact now")).toBeUndefined();
  });

  it("is undefined for a draft that isn't a slash command in progress", () => {
    expect(commandQueryFromDraft("hello")).toBeUndefined();
    expect(commandQueryFromDraft("")).toBeUndefined();
    expect(commandQueryFromDraft("see /compact")).toBeUndefined();
  });
});

describe("filterCommands", () => {
  const commands: AgentCommand[] = [
    { name: "compact", description: "Compact the session" },
    { name: "skill:code-review", description: "Review changes" },
    { name: "review", description: "Different command entirely" },
  ];

  it("matches by name prefix, case-insensitively", () => {
    expect(filterCommands(commands, "COMP").map((c) => c.name)).toEqual([
      "compact",
    ]);
  });

  it("matches a skill the same as any other command — no separate list", () => {
    expect(filterCommands(commands, "skill:").map((c) => c.name)).toEqual([
      "skill:code-review",
    ]);
  });

  it("returns everything for an empty query", () => {
    expect(filterCommands(commands, "")).toHaveLength(3);
  });

  it("returns nothing when no name matches", () => {
    expect(filterCommands(commands, "zzz")).toEqual([]);
  });
});

describe("draftAfterCommandPick", () => {
  it("inserts the name, slash-prefixed and space-terminated", () => {
    expect(draftAfterCommandPick({ name: "compact" })).toBe("/compact ");
  });
});

describe("paletteNavAction", () => {
  it("maps arrows, Enter, Tab, and Escape", () => {
    expect(paletteNavAction("ArrowDown", false)).toBe("down");
    expect(paletteNavAction("ArrowUp", false)).toBe("up");
    expect(paletteNavAction("Enter", false)).toBe("pick");
    expect(paletteNavAction("Tab", false)).toBe("pick");
    expect(paletteNavAction("Escape", false)).toBe("dismiss");
  });

  it("leaves Shift+Enter and other keys to the textarea", () => {
    expect(paletteNavAction("Enter", true)).toBeUndefined();
    expect(paletteNavAction("a", false)).toBeUndefined();
  });
});

describe("stepPaletteIndex", () => {
  it("wraps at both ends", () => {
    expect(stepPaletteIndex(0, "down", 3)).toBe(1);
    expect(stepPaletteIndex(2, "down", 3)).toBe(0);
    expect(stepPaletteIndex(0, "up", 3)).toBe(2);
  });

  it("stays at 0 when the list is empty", () => {
    expect(stepPaletteIndex(4, "down", 0)).toBe(0);
  });
});

describe("clampPaletteIndex", () => {
  it("pins an out-of-range index after the list shrinks", () => {
    expect(clampPaletteIndex(8, 3)).toBe(2);
    expect(clampPaletteIndex(-1, 3)).toBe(0);
    expect(clampPaletteIndex(1, 0)).toBe(0);
  });
});

describe("commandDisplayTitle", () => {
  it("title-cases a bare name and a hyphenated skill", () => {
    expect(commandDisplayTitle("compact")).toBe("Compact");
    expect(commandDisplayTitle("skill:code-review")).toBe("Code Review");
  });
});

describe("withReservedCommands", () => {
  const cmd = (name: string): AgentCommand => ({
    name,
    description: `the agent's ${name}`,
  });

  it("substitutes Silo's clear in place, keeping the agent's order", () => {
    const out = withReservedCommands([
      cmd("compact"),
      cmd("clear"),
      cmd("review"),
    ]);
    expect(out.map((c) => c.name)).toEqual(["compact", "clear", "review"]);
    expect(out[1]).toBe(RESERVED_CLEAR);
    expect(out[0].description).toBe("the agent's compact");
  });

  it("matches the reserved name case-insensitively", () => {
    const out = withReservedCommands([cmd("Clear")]);
    expect(out).toEqual([RESERVED_CLEAR]);
  });

  it("appends it when the agent advertises no clear — typing it works either way", () => {
    const out = withReservedCommands([cmd("compact")]);
    expect(out.map((c) => c.name)).toEqual(["compact", "clear"]);
  });

  it("offers it even when the agent advertises nothing at all", () => {
    expect(withReservedCommands([])).toEqual([RESERVED_CLEAR]);
  });
});

describe("isReservedDraft", () => {
  it("recognises /clear, whitespace around it and all", () => {
    expect(isReservedDraft("/clear")).toBe(true);
    expect(isReservedDraft("  /clear  ")).toBe(true);
  });

  it("leaves an argument to the agent rather than swallowing what was typed", () => {
    expect(isReservedDraft("/clear the decks")).toBe(false);
  });

  it("is not fooled by a longer name or a missing slash", () => {
    expect(isReservedDraft("/clearing")).toBe(false);
    expect(isReservedDraft("clear")).toBe(false);
    expect(isReservedDraft("please /clear")).toBe(false);
  });
});

describe("isClearShortcut", () => {
  const key = (over: Partial<Parameters<typeof isClearShortcut>[0]> = {}) => ({
    key: "k",
    metaKey: false,
    ctrlKey: false,
    shiftKey: true,
    ...over,
  });

  it("is ⌘⇧K on macOS and Ctrl+Shift+K elsewhere", () => {
    expect(isClearShortcut(key({ metaKey: true }), true)).toBe(true);
    expect(isClearShortcut(key({ ctrlKey: true }), false)).toBe(true);
  });

  it("does not fire on the other platform's modifier", () => {
    expect(isClearShortcut(key({ ctrlKey: true }), true)).toBe(false);
    expect(isClearShortcut(key({ metaKey: true }), false)).toBe(false);
  });

  it("requires Shift — the unshifted chord is the terminal's clear", () => {
    expect(isClearShortcut(key({ metaKey: true, shiftKey: false }), true)).toBe(
      false,
    );
    expect(
      isClearShortcut(key({ ctrlKey: true, shiftKey: false }), false),
    ).toBe(false);
  });

  it("needs the modifier, and needs the K", () => {
    expect(isClearShortcut(key(), true)).toBe(false);
    expect(isClearShortcut(key({ key: "j", metaKey: true }), true)).toBe(false);
    expect(isClearShortcut(key({ key: "K", metaKey: true }), true)).toBe(true);
  });
});

describe("clearShortcutLabel", () => {
  it("spells the chord per platform", () => {
    expect(clearShortcutLabel(true)).toBe("⌘⇧K");
    expect(clearShortcutLabel(false)).toBe("Ctrl+Shift+K");
  });
});
