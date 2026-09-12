import { describe, it, expect } from "vitest";
import type { AgentCommand } from "@silo-code/sdk";
import {
  clampPaletteIndex,
  commandDisplayTitle,
  commandQueryFromDraft,
  draftAfterCommandPick,
  filterCommands,
  paletteNavAction,
  stepPaletteIndex,
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
  it("maps arrows, Enter, and Escape", () => {
    expect(paletteNavAction("ArrowDown", false)).toBe("down");
    expect(paletteNavAction("ArrowUp", false)).toBe("up");
    expect(paletteNavAction("Enter", false)).toBe("pick");
    expect(paletteNavAction("Escape", false)).toBe("dismiss");
  });

  it("leaves Shift+Enter and other keys to the textarea", () => {
    expect(paletteNavAction("Enter", true)).toBeUndefined();
    expect(paletteNavAction("Tab", false)).toBeUndefined();
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
