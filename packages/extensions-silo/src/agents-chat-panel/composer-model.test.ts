import { describe, it, expect } from "vitest";
import {
  COMPOSER_MAX_HEIGHT_PX,
  DOUBLE_ESCAPE_MS,
  NOT_NAVIGATING_HISTORY,
  caretOnFirstLine,
  caretOnLastLine,
  composerCanSend,
  composerInputEnabled,
  composerPlaceholder,
  composerShowConnecting,
  composerSubmitAction,
  composerTextareaHeightPx,
  historyNavDown,
  historyNavUp,
  isDoubleEscape,
  type HistoryNavState,
} from "./composer-model";

describe("composerInputEnabled", () => {
  it("lets the user type while the agent is still connecting", () => {
    expect(composerInputEnabled(false, false)).toBe(true);
  });

  it("locks the field when the agent is gone or the session is journal-only", () => {
    expect(composerInputEnabled(true, false)).toBe(false);
    expect(composerInputEnabled(false, true)).toBe(false);
    expect(composerInputEnabled(true, true)).toBe(false);
  });
});

describe("composerSubmitAction", () => {
  const live = {
    draft: "hello",
    reservedKind: undefined,
    canReset: true,
    canList: true,
    hasHandle: true,
    busy: false,
    ready: true,
    lost: false,
    attachmentCount: 0,
  } as const;
  const clear = { ...live, draft: "/clear", reservedKind: "clear" } as const;
  const resume = {
    ...live,
    draft: "/resume",
    reservedKind: "resume",
  } as const;

  it("sends an ordinary draft to a live, idle agent", () => {
    expect(composerSubmitAction(live)).toBe("send");
  });

  it("resets on the reserved draft", () => {
    expect(composerSubmitAction(clear)).toBe("reset");
  });

  // RFC 0048 R6 / R1 — the bug this encodes: `/clear` used to sit *behind*
  // the send guard, so typing it mid-turn did nothing at all while ⌘⇧K and the
  // tab menu (gated on `canReset` alone) reset just fine. Every state that
  // blocks a prompt must still reset.
  it("resets mid-turn, while connecting, when lost, and with no live handle", () => {
    expect(composerSubmitAction({ ...clear, busy: true })).toBe("reset");
    expect(composerSubmitAction({ ...clear, ready: false })).toBe("reset");
    expect(composerSubmitAction({ ...clear, lost: true })).toBe("reset");
    expect(composerSubmitAction({ ...clear, hasHandle: false })).toBe("reset");
  });

  it("does nothing on `/clear` with no session to reset", () => {
    expect(composerSubmitAction({ ...clear, canReset: false })).toBe("none");
  });

  it("still sends `/clear` with an argument — it is not reserved", () => {
    // `reservedKind` is `reservedCommandForDraft`'s answer, and it says
    // `undefined` here.
    expect(
      composerSubmitAction({
        ...live,
        draft: "/clear the decks",
        reservedKind: undefined,
      }),
    ).toBe("send");
  });

  it("blocks an ordinary draft mid-turn, with no handle, or when unsendable", () => {
    expect(composerSubmitAction({ ...live, busy: true })).toBe("none");
    expect(composerSubmitAction({ ...live, hasHandle: false })).toBe("none");
    expect(composerSubmitAction({ ...live, ready: false })).toBe("none");
    expect(composerSubmitAction({ ...live, lost: true })).toBe("none");
    expect(composerSubmitAction({ ...live, draft: "   " })).toBe("none");
  });

  it("sends on attachments alone, with an empty draft", () => {
    expect(
      composerSubmitAction({ ...live, draft: "", attachmentCount: 1 }),
    ).toBe("send");
  });

  // Session Discovery (RFC 0051) — `/resume` follows the same "reserved
  // outranks the send guard" precedence `/clear` already established.
  it("opens the resume picker on the reserved /resume draft, outranking busy/ready/lost", () => {
    expect(composerSubmitAction(resume)).toBe("resume-picker");
    expect(composerSubmitAction({ ...resume, busy: true })).toBe(
      "resume-picker",
    );
    expect(composerSubmitAction({ ...resume, ready: false })).toBe(
      "resume-picker",
    );
    expect(composerSubmitAction({ ...resume, lost: true })).toBe(
      "resume-picker",
    );
  });

  it("does nothing on `/resume` when the agent doesn't support session/list", () => {
    expect(composerSubmitAction({ ...resume, canList: false })).toBe("none");
  });
});

describe("composerCanSend", () => {
  const draft = {
    ready: true,
    lost: false,
    draft: "hello",
    attachmentCount: 0,
  };

  it("arms Send once the agent is ready and the draft is non-empty", () => {
    expect(composerCanSend(draft)).toBe(true);
  });

  it("arms Send on attachments alone", () => {
    expect(composerCanSend({ ...draft, draft: "", attachmentCount: 1 })).toBe(
      true,
    );
  });

  it("stays off while connecting, even if the user already typed", () => {
    expect(composerCanSend({ ...draft, ready: false })).toBe(false);
  });

  it("stays off when the agent is lost, the draft is blank, or only whitespace", () => {
    expect(composerCanSend({ ...draft, lost: true })).toBe(false);
    expect(composerCanSend({ ...draft, draft: "", attachmentCount: 0 })).toBe(
      false,
    );
    expect(composerCanSend({ ...draft, draft: "   " })).toBe(false);
  });
});

describe("composerShowConnecting", () => {
  it("is only the connecting phase — ready/error/no-profile show the real controls", () => {
    expect(composerShowConnecting("connecting")).toBe(true);
    expect(composerShowConnecting("ready")).toBe(false);
    expect(composerShowConnecting("error")).toBe(false);
    expect(composerShowConnecting("no-profile")).toBe(false);
  });
});

describe("composerPlaceholder", () => {
  it("invites a draft even before the agent is ready", () => {
    expect(composerPlaceholder(false, false)).toBe(
      "Message the agent or use /commands and /skills",
    );
  });

  it("explains the locked states", () => {
    expect(composerPlaceholder(false, true)).toMatch(/read-only/);
    expect(composerPlaceholder(true, false)).toMatch(/no longer running/);
  });
});

describe("composerTextareaHeightPx", () => {
  it("fits a short draft's own content height", () => {
    expect(composerTextareaHeightPx(48)).toBe(48);
  });

  it("caps a long draft at the max height instead of growing forever", () => {
    expect(composerTextareaHeightPx(1000)).toBe(COMPOSER_MAX_HEIGHT_PX);
  });

  it("is exact at the boundary", () => {
    expect(composerTextareaHeightPx(COMPOSER_MAX_HEIGHT_PX)).toBe(
      COMPOSER_MAX_HEIGHT_PX,
    );
  });
});

describe("caretOnFirstLine / caretOnLastLine", () => {
  it("is true at either end of a single-line draft", () => {
    expect(caretOnFirstLine("hello", 0)).toBe(true);
    expect(caretOnFirstLine("hello", 5)).toBe(true);
    expect(caretOnLastLine("hello", 0)).toBe(true);
    expect(caretOnLastLine("hello", 5)).toBe(true);
  });

  it("is false once a newline sits between the caret and that end", () => {
    const draft = "line one\nline two\nline three";
    const line2Start = draft.indexOf("line two");
    expect(caretOnFirstLine(draft, line2Start)).toBe(false);
    expect(caretOnLastLine(draft, line2Start)).toBe(false);
  });

  it("is true on the draft's first/last line even mid-line", () => {
    const draft = "line one\nline two\nline three";
    expect(caretOnFirstLine(draft, 4)).toBe(true);
    expect(caretOnLastLine(draft, draft.length - 3)).toBe(true);
  });
});

describe("historyNavUp / historyNavDown", () => {
  const history = ["first prompt", "second prompt", "third prompt"];

  it("recalls the newest entry first, banking the in-progress draft", () => {
    const up = historyNavUp(history, NOT_NAVIGATING_HISTORY, "still typing");
    expect(up).toEqual({
      state: { index: 2, draftBeforeHistory: "still typing" },
      draft: "third prompt",
    });
  });

  it("steps to older entries on repeated ↑, stopping at the oldest", () => {
    let state: HistoryNavState = NOT_NAVIGATING_HISTORY;
    let draft = "typing";
    for (const want of ["third prompt", "second prompt", "first prompt"]) {
      const next = historyNavUp(history, state, draft);
      expect(next?.draft).toBe(want);
      state = next!.state;
      draft = next!.draft;
    }
    // Already at the oldest — another ↑ holds there, doesn't go past it.
    const atOldest = historyNavUp(history, state, draft);
    expect(atOldest?.draft).toBe("first prompt");
    expect(atOldest?.state.index).toBe(0);
  });

  it("does nothing on ↑ with no history yet", () => {
    expect(historyNavUp([], NOT_NAVIGATING_HISTORY, "typing")).toBeUndefined();
  });

  it("does nothing on ↓ when not currently navigating", () => {
    expect(historyNavDown(history, NOT_NAVIGATING_HISTORY)).toBeUndefined();
  });

  it("steps to newer entries on ↓, then hands back the banked draft", () => {
    const up = historyNavUp(history, NOT_NAVIGATING_HISTORY, "my draft")!;
    const older = historyNavUp(history, up.state, up.draft)!;
    expect(older.draft).toBe("second prompt");

    const newer = historyNavDown(history, older.state)!;
    expect(newer.draft).toBe("third prompt");

    const backToDraft = historyNavDown(history, newer.state)!;
    expect(backToDraft).toEqual({
      state: NOT_NAVIGATING_HISTORY,
      draft: "my draft",
    });
  });
});

describe("isDoubleEscape", () => {
  it("is true just under the threshold", () => {
    expect(isDoubleEscape(1000, 1000 + DOUBLE_ESCAPE_MS - 1)).toBe(true);
  });

  it("is false at or past the threshold", () => {
    expect(isDoubleEscape(1000, 1000 + DOUBLE_ESCAPE_MS)).toBe(false);
  });
});
