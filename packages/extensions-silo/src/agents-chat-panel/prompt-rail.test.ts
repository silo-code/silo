import { describe, expect, it } from "vitest";

import {
  PROMPT_RAIL_FOCUS_SPAN,
  PROMPT_RAIL_PITCH_PX,
  PROMPT_RAIL_PREVIEW_CHARS,
  PROMPT_RAIL_TOP_INSET_PX,
  previewText,
  previewTop,
  promptTicks,
  tickAtY,
  tickEmphasis,
  tickLayout,
} from "./prompt-rail";
import type { MessageEntry, Turn } from "./transcript-model";

/** A user message as `groupTurns` hands it over. */
function user(key: string, text: string): MessageEntry {
  return { type: "message", key, role: "user", text };
}

/** A turn, keyed positionally the way `groupTurns` keys them. */
function turn(index: number, u: MessageEntry | undefined): Turn {
  return { key: `t${index}`, user: u, rest: [] };
}

describe("promptTicks", () => {
  it("draws one tick per turn that opened with a user message", () => {
    const ticks = promptTicks([
      turn(0, user("e1", "first")),
      turn(1, user("e4", "second")),
    ]);
    expect(ticks).toEqual([
      { key: "e1", text: "first", index: 0 },
      { key: "e4", text: "second", index: 1 },
    ]);
  });

  it("keys ticks by the message, not by the turn's positional key", () => {
    // `t0` shifts when entries are filtered differently; `e7` does not.
    const [tick] = promptTicks([turn(0, user("e7", "hello"))]);
    expect(tick?.key).toBe("e7");
  });

  it("skips a leading turn the agent opened on its own", () => {
    // A journal can in principle replay entries before any user message.
    expect(
      promptTicks([turn(0, undefined), turn(1, user("e3", "hi"))]),
    ).toEqual([{ key: "e3", text: "hi", index: 0 }]);
  });

  it("skips a blank prompt so it cannot be jumped to", () => {
    expect(promptTicks([turn(0, user("e1", "   \n "))])).toEqual([]);
  });

  it("numbers the remaining ticks contiguously", () => {
    const ticks = promptTicks([
      turn(0, user("e1", "a")),
      turn(1, user("e2", " ")),
      turn(2, user("e3", "b")),
    ]);
    expect(ticks.map((t) => t.index)).toEqual([0, 1]);
  });

  it("has nothing to draw for an empty transcript", () => {
    expect(promptTicks([])).toEqual([]);
  });
});

describe("tickLayout", () => {
  it("hangs a stack that fits from the top at the nominal pitch", () => {
    const l = tickLayout({ count: 5, availablePx: 200 });
    expect(l.pitchPx).toBe(PROMPT_RAIL_PITCH_PX);
    expect(l.topPx).toBe(PROMPT_RAIL_TOP_INSET_PX);
  });

  it("starts the first dash in the same place however long the chat is", () => {
    // The point of hanging from the top rather than centring: the first
    // prompt does not drift as prompts are added below it.
    expect(tickLayout({ count: 3, availablePx: 400 }).topPx).toBe(
      tickLayout({ count: 30, availablePx: 400 }).topPx,
    );
  });

  it("compresses the pitch rather than overflow a short rail", () => {
    // 21 ticks want 140px but only 80px is left between the two insets.
    const l = tickLayout({ count: 21, availablePx: 100 });
    expect(l.pitchPx).toBe(4);
    expect(l.topPx).toBe(10);
    // The last dash lands on the bottom inset, not past it.
    expect(l.topPx + l.pitchPx * 20).toBe(90);
  });

  it("puts a lone tick at the top inset", () => {
    expect(tickLayout({ count: 1, availablePx: 200 })).toEqual({
      pitchPx: PROMPT_RAIL_PITCH_PX,
      topPx: PROMPT_RAIL_TOP_INSET_PX,
    });
  });

  it("survives a rail measured before layout settled", () => {
    const l = tickLayout({ count: 5, availablePx: 0 });
    expect(l.pitchPx).toBe(0);
    expect(l.topPx).toBe(0);
  });

  it("keeps the stack inside a rail shorter than the inset", () => {
    expect(tickLayout({ count: 4, availablePx: 6 }).topPx).toBe(6);
  });

  it("treats a negative height as no room at all", () => {
    expect(tickLayout({ count: 4, availablePx: -40 }).topPx).toBe(0);
  });

  it("honours an explicit pitch", () => {
    expect(
      tickLayout({ count: 3, availablePx: 200, pitchPx: 10 }).pitchPx,
    ).toBe(10);
  });

  it("honours an explicit inset", () => {
    expect(tickLayout({ count: 3, availablePx: 200, insetPx: 40 }).topPx).toBe(
      40,
    );
  });
});

describe("tickAtY", () => {
  // A 5-tick stack at pitch 10 starting at 100 — ticks at 100,110,…,140.
  const stack = { count: 5, pitchPx: 10, topPx: 100 };

  it("resolves a pointer sitting on a tick", () => {
    expect(tickAtY({ ...stack, y: 120 })).toBe(2);
  });

  it("snaps to the nearer of two ticks", () => {
    expect(tickAtY({ ...stack, y: 124 })).toBe(2);
    expect(tickAtY({ ...stack, y: 126 })).toBe(3);
  });

  it("gives the end ticks the same half-pitch target as the middle ones", () => {
    expect(tickAtY({ ...stack, y: 95 })).toBe(0);
    expect(tickAtY({ ...stack, y: 145 })).toBe(4);
  });

  it("reports nothing above the stack", () => {
    expect(tickAtY({ ...stack, y: 94 })).toBeNull();
  });

  it("reports nothing below the stack", () => {
    expect(tickAtY({ ...stack, y: 146 })).toBeNull();
  });

  it("resolves a lone tick within half a pitch of it", () => {
    expect(tickAtY({ count: 1, pitchPx: 10, topPx: 50, y: 53 })).toBe(0);
    expect(tickAtY({ count: 1, pitchPx: 10, topPx: 50, y: 60 })).toBeNull();
  });

  it("has nothing to resolve on an empty rail", () => {
    expect(tickAtY({ count: 0, pitchPx: 10, topPx: 50, y: 50 })).toBeNull();
  });
});

describe("tickEmphasis", () => {
  it("leaves every tick at rest when nothing is hovered", () => {
    expect(tickEmphasis(0, null)).toBe(0);
    expect(tickEmphasis(9, null)).toBe(0);
  });

  it("gives the hovered tick full emphasis", () => {
    expect(tickEmphasis(4, 4)).toBe(1);
  });

  it("tapers across the focus span", () => {
    expect(tickEmphasis(5, 4)).toBe(0.75);
    expect(tickEmphasis(6, 4)).toBe(0.5);
    expect(tickEmphasis(7, 4)).toBe(0.25);
  });

  it("leaves ticks beyond the span untouched", () => {
    expect(tickEmphasis(4 + PROMPT_RAIL_FOCUS_SPAN + 1, 4)).toBe(0);
    expect(tickEmphasis(40, 4)).toBe(0);
  });

  it("falls off the same way above and below the cursor", () => {
    expect(tickEmphasis(2, 4)).toBe(tickEmphasis(6, 4));
  });

  it("honours a custom span", () => {
    expect(tickEmphasis(5, 4, 1)).toBe(0.5);
    expect(tickEmphasis(6, 4, 1)).toBe(0);
  });
});

describe("previewText", () => {
  it("returns a short prompt whole", () => {
    expect(previewText("fix the build")).toBe("fix the build");
  });

  it("collapses the newlines of a multi-line prompt onto one line", () => {
    expect(previewText("fix the build\n\n  it is red  ")).toBe(
      "fix the build it is red",
    );
  });

  it("cuts a long prompt at a word boundary", () => {
    expect(previewText("alpha beta gamma delta", 14)).toBe("alpha beta…");
  });

  it("cuts mid-word when the run of characters has no boundary", () => {
    // Falling back to a hard cut rather than returning almost nothing.
    expect(previewText(`${"x".repeat(40)}`, 10)).toBe("xxxxxxxxxx…");
  });

  it("cuts mid-word when the only boundary is too near the start", () => {
    expect(previewText(`a ${"x".repeat(40)}`, 10)).toBe("a xxxxxxxx…");
  });

  it("has nothing to show for a whitespace-only prompt", () => {
    expect(previewText("   \n\t ")).toBe("");
  });

  it("defaults to the documented budget", () => {
    const long = "word ".repeat(200);
    expect(previewText(long).length).toBeLessThanOrEqual(
      PROMPT_RAIL_PREVIEW_CHARS + 1,
    );
  });
});

describe("previewTop", () => {
  const card = { cardHeightPx: 60, boundsHeightPx: 400 };

  it("centres the card on the cursor in open space", () => {
    expect(previewTop({ ...card, cursorY: 200 })).toBe(170);
  });

  it("holds the card inside the top edge", () => {
    expect(previewTop({ ...card, cursorY: 10 })).toBe(8);
  });

  it("holds the card inside the bottom edge", () => {
    expect(previewTop({ ...card, cursorY: 395 })).toBe(332);
  });

  it("pins a card taller than the panel to the top", () => {
    expect(
      previewTop({ cursorY: 100, cardHeightPx: 500, boundsHeightPx: 400 }),
    ).toBe(8);
  });

  it("honours a custom margin", () => {
    expect(previewTop({ ...card, cursorY: 0, marginPx: 20 })).toBe(20);
  });
});
