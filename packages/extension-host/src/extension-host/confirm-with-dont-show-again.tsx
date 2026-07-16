import { useState } from "react";
import type { ExtensionStorage, UiService } from "@silo-code/sdk";
import { ModalActions } from "./Modal";

// A `ctx.ui.showModal`-based confirm/info dialog with a persisted "don't show
// this again" checkbox — the one capability `ctx.ui.confirm` has no room for
// (ConfirmOptions is a plain title/body/two-buttons shape). Built as host
// content rather than a public SDK addition: extending `ConfirmOptions` would
// drag every consumer (and the docs-generation pipeline) into a contract
// change for what today is a single feature's need.

/**
 * `confirm`: Cancel + a primary/danger button, dismissible (Escape/backdrop
 * resolve like Cancel) — mirrors `ctx.ui.confirm`.
 * `info`: a single acknowledgement button, not dismissible — there's nothing
 * to cancel, so forcing the explicit click keeps the checkbox's fate
 * unambiguous.
 *
 * @internal
 */
export type DontShowAgainDialogMode =
  | { kind: "confirm"; danger?: boolean }
  | { kind: "info" };

/** @internal */
export interface DontShowAgainDialogOptions {
  /** Key in `storage` that remembers the user opted out of this dialog. */
  storageKey: string;
  title: string;
  body: string;
  confirmLabel: string;
  mode: DontShowAgainDialogMode;
}

/**
 * Pure decision behind the dialog's two buttons: cancelling never persists
 * the checkbox (even if it's checked) so an accidental cancel can't silently
 * kill a safety warning; proceeding persists it iff it's checked. Extracted
 * from the component so it's unit-testable without rendering.
 *
 * @internal
 */
export function resolveDialogOutcome(
  action: "proceed" | "cancel",
  dontShowAgain: boolean,
): { proceed: boolean; persist: boolean } {
  if (action === "cancel") return { proceed: false, persist: false };
  return { proceed: true, persist: dontShowAgain };
}

function DontShowAgainDialogContent({
  body,
  confirmLabel,
  mode,
  storage,
  storageKey,
  close,
}: {
  body: string;
  confirmLabel: string;
  mode: DontShowAgainDialogMode;
  storage: ExtensionStorage;
  storageKey: string;
  close: (result?: boolean) => void;
}) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  function act(action: "proceed" | "cancel") {
    const outcome = resolveDialogOutcome(action, dontShowAgain);
    if (outcome.persist) storage.set(storageKey, true);
    close(outcome.proceed);
  }

  return (
    <>
      <div className="silo-modal-body">{body}</div>
      <label className="silo-modal-checkbox-row">
        <input
          type="checkbox"
          checked={dontShowAgain}
          onChange={(e) => setDontShowAgain(e.target.checked)}
        />
        Don't show this again
      </label>
      <ModalActions>
        {mode.kind === "confirm" && (
          <button
            type="button"
            className="silo-button"
            onClick={() => act("cancel")}
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          className={
            mode.kind === "confirm" && mode.danger
              ? "silo-button-danger"
              : "silo-button-primary"
          }
          onClick={() => act("proceed")}
          autoFocus
        >
          {confirmLabel}
        </button>
      </ModalActions>
    </>
  );
}

/**
 * Pop a confirm/info dialog with a persisted "don't show this again"
 * checkbox, short-circuiting to `true` (proceed) without opening anything
 * once the user has suppressed `opts.storageKey`. See
 * {@link DontShowAgainDialogMode} for the `confirm` vs. `info` shapes.
 *
 * @internal
 */
export async function confirmWithDontShowAgain(
  ui: UiService,
  storage: ExtensionStorage,
  opts: DontShowAgainDialogOptions,
): Promise<boolean> {
  if (storage.get<boolean>(opts.storageKey, false)) return true;
  const result = await ui.showModal<boolean>(
    (close) => (
      <DontShowAgainDialogContent
        body={opts.body}
        confirmLabel={opts.confirmLabel}
        mode={opts.mode}
        storage={storage}
        storageKey={opts.storageKey}
        close={close}
      />
    ),
    {
      title: opts.title,
      size: "sm",
      ariaLabel: opts.title,
      dismissible: opts.mode.kind === "confirm",
    },
  );
  return result ?? false;
}
