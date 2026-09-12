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
