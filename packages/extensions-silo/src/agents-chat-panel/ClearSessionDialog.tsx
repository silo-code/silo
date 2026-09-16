import { useState } from "react";
import { Button, CheckboxRow, ModalActions } from "@silo-code/sdk";

/** What the user chose. `undefined` from `close()` (Cancel or dismiss) means
 *  the reset does not happen. */
export interface ClearSessionChoice {
  /** The "Don't ask again" box was ticked — turn the confirmation off. */
  readonly dontAskAgain: boolean;
}

export interface ClearSessionDialogProps {
  /** Whether the transcript being discarded is *known* to be the
   *  conversation's only copy — a `"journal-only"` session, where the agent
   *  could neither resume nor replay it. Sharpens the warning; its absence
   *  doesn't promise the agent has a copy, only that the panel can't say so. */
  readonly journalIsOnlyCopy: boolean;
  /** Settle the host modal: a choice to reset, or `undefined` to cancel. */
  readonly close: (choice?: ClearSessionChoice) => void;
}

/**
 * Confirmation for **Clear Session** — the session reset (RFC 0048).
 *
 * `ctx.ui.confirm` would be a single plain-text line with no room for the
 * "Don't ask again" box, so this is `ctx.ui.showModal` content instead; the
 * host owns the surrounding modal chrome and title. Same shape as
 * `git-explorer`'s `ForceDeleteDialog`.
 */
export function ClearSessionDialog({
  journalIsOnlyCopy,
  close,
}: ClearSessionDialogProps) {
  const [dontAskAgain, setDontAskAgain] = useState(false);
  return (
    <div className="acp-chat-clear-confirm">
      <p className="acp-chat-clear-confirm-lead">
        This ends the current session and starts a new one. The agent forgets
        the conversation, and this transcript is{" "}
        <strong>permanently discarded</strong>
        {journalIsOnlyCopy ? " — it is the only copy" : ""}.
      </p>
      <CheckboxRow
        label="Don't ask again"
        checked={dontAskAgain}
        onChange={setDontAskAgain}
      />
      <ModalActions>
        <Button type="button" onClick={() => close()}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="danger"
          onClick={() => close({ dontAskAgain })}
        >
          Clear Session
        </Button>
      </ModalActions>
    </div>
  );
}
