/**
 * Composer enablement while a Chat session is coming up (or already live).
 *
 * The input accepts keystrokes as soon as the panel exists; Send waits for
 * a live agent. Pure so the "type now, send later" contract is tested
 * independent of the `Textarea`.
 */

/** The user can type unless the session is gone or journal-only. Connecting
 *  does not lock the field — they can draft while the agent starts. */
export function composerInputEnabled(
  lost: boolean,
  readOnly: boolean,
): boolean {
  return !lost && !readOnly;
}

/** Send is armed only once the agent is live and there is something to send. */
export function composerCanSend(opts: {
  readonly ready: boolean;
  readonly lost: boolean;
  readonly draft: string;
  readonly attachmentCount: number;
}): boolean {
  return (
    opts.ready &&
    !opts.lost &&
    (opts.draft.trim().length > 0 || opts.attachmentCount > 0)
  );
}

/**
 * What pressing Send (or ⏎) does with the current composer state — the one
 * place the precedence between a **session reset** and an ordinary prompt is
 * decided (RFC 0048 R1: no second implementation of clear anywhere in the
 * panel).
 *
 * The reset wins over the send guard, it is not subject to it. `/clear` never
 * reaches the agent — it tears the connection down and reconnects fresh — so
 * none of what gates a prompt applies: not `busy` (R6 commits to a mid-turn
 * reset ending the in-flight turn, the way a profile switch already does),
 * not `ready`, not `lost`, not a live handle. The only thing a reset needs is
 * a session to reset, which is `canReset`. Checking the guard first is what
 * made a typed `/clear` inert mid-turn while ⌘⇧K and the tab menu — gated on
 * `canReset` alone — reset just fine.
 */
export function composerSubmitAction(opts: {
  readonly draft: string;
  readonly reserved: boolean;
  readonly canReset: boolean;
  readonly hasHandle: boolean;
  readonly busy: boolean;
  readonly ready: boolean;
  readonly lost: boolean;
  readonly attachmentCount: number;
}): "reset" | "send" | "none" {
  if (opts.reserved) return opts.canReset ? "reset" : "none";
  if (!opts.hasHandle || opts.busy) return "none";
  return composerCanSend(opts) ? "send" : "none";
}

/** The control-row status that replaces Attach / session pills. */
export function composerShowConnecting(status: string): boolean {
  return status === "connecting";
}

export function composerPlaceholder(lost: boolean, readOnly: boolean): string {
  if (readOnly) {
    return "This session is read-only — continue in a new one to keep talking.";
  }
  if (lost) {
    return "The agent is no longer running.";
  }
  return "Message the agent or use /commands and /skills";
}

/** The composer grows with a multi-line draft up to this height, past which
 *  it scrolls internally instead of crowding out the transcript above it. */
export const COMPOSER_MAX_HEIGHT_PX = 200;

/** Height to apply to the textarea element for its current content
 *  (`scrollHeight` with the height reset, so it can shrink back down too),
 *  clamped to {@link COMPOSER_MAX_HEIGHT_PX}. */
export function composerTextareaHeightPx(scrollHeightPx: number): number {
  return Math.min(scrollHeightPx, COMPOSER_MAX_HEIGHT_PX);
}

/**
 * ↑/↓ prompt history (Dave's call, terminal-shell convention). A multi-line
 * draft keeps its own caret movement first — ↑/↓ only step through history
 * once the caret is already on the draft's first/last line, same rule a
 * shell readline applies before it'll walk history over a multi-line entry.
 */

/** No `\n` before `caret` — ↑ falls through to history recall here instead
 *  of moving the caret up a line. */
export function caretOnFirstLine(value: string, caret: number): boolean {
  return !value.slice(0, caret).includes("\n");
}

/** The ↓ mirror of {@link caretOnFirstLine}. */
export function caretOnLastLine(value: string, caret: number): boolean {
  return !value.slice(caret).includes("\n");
}

/** `index` counts back from the newest entry (`history.length - 1`); `null`
 *  means the composer is showing the live draft, not a recalled one. */
export interface HistoryNavState {
  readonly index: number | null;
  readonly draftBeforeHistory: string;
}

export const NOT_NAVIGATING_HISTORY: HistoryNavState = {
  index: null,
  draftBeforeHistory: "",
};

/** ↑ one step: an older prompt. The first press (from `index: null`) banks
 *  `draft` so ↓ can hand it back once navigation runs off the newest end;
 *  `undefined` when there's no history to step into. */
export function historyNavUp(
  history: readonly string[],
  state: HistoryNavState,
  draft: string,
): { state: HistoryNavState; draft: string } | undefined {
  if (history.length === 0) return undefined;
  const index =
    state.index === null ? history.length - 1 : Math.max(0, state.index - 1);
  const draftBeforeHistory =
    state.index === null ? draft : state.draftBeforeHistory;
  return { state: { index, draftBeforeHistory }, draft: history[index] };
}

/** ↓ one step: a newer prompt, or the banked live draft once navigation
 *  runs off the newest end. `undefined` when not currently navigating. */
export function historyNavDown(
  history: readonly string[],
  state: HistoryNavState,
): { state: HistoryNavState; draft: string } | undefined {
  if (state.index === null) return undefined;
  if (state.index >= history.length - 1) {
    return { state: NOT_NAVIGATING_HISTORY, draft: state.draftBeforeHistory };
  }
  const index = state.index + 1;
  return {
    state: { index, draftBeforeHistory: state.draftBeforeHistory },
    draft: history[index],
  };
}

/** A second Escape within this many ms of the first clears the draft. */
export const DOUBLE_ESCAPE_MS = 500;

export function isDoubleEscape(lastEscapeAtMs: number, nowMs: number): boolean {
  return nowMs - lastEscapeAtMs < DOUBLE_ESCAPE_MS;
}
