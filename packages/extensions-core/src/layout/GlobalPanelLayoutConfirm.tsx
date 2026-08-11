import { useState } from "react";
import { Button, ModalActions } from "@silo-code/sdk";
import type { UiService } from "@silo-code/sdk";

// Confirmation for turning "Global Side Panel Layout" on (ADR 0035), via
// `ctx.ui.showModal` — plain `ctx.ui.confirm` has no room for the optional
// checkbox. Enabling always overrides every workspace's layout with the
// active workspace's current one *unless* a previously-saved shared layout
// exists and the user checks the box to restore that instead. Cancel backs
// out without changing anything, e.g. to switch to a different workspace
// first.

export type GlobalPanelLayoutChoice = "current" | "previous" | "cancel";

function GlobalPanelLayoutConfirmContent({
  hasSaved,
  close,
}: {
  hasSaved: boolean;
  close: (result?: GlobalPanelLayoutChoice) => void;
}) {
  const [restorePrevious, setRestorePrevious] = useState(false);

  return (
    <>
      <div className="silo-modal-body">
        This overrides every workspace&apos;s side panel layout with the active
        workspace&apos;s layout.
      </div>
      {hasSaved && (
        <label className="silo-modal-checkbox-row">
          <input
            type="checkbox"
            checked={restorePrevious}
            onChange={(e) => setRestorePrevious(e.target.checked)}
          />
          Restore my previous shared layout instead
        </label>
      )}
      <ModalActions>
        <Button type="button" onClick={() => close("cancel")}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={() => close(restorePrevious ? "previous" : "current")}
          autoFocus
        >
          OK
        </Button>
      </ModalActions>
    </>
  );
}

/**
 * Show the confirmation and resolve to the user's choice. Dismissing
 * (Escape/backdrop) resolves to `"cancel"`, same as clicking Cancel.
 */
export async function confirmEnableGlobalPanelLayout(
  ui: UiService,
  hasSaved: boolean,
): Promise<GlobalPanelLayoutChoice> {
  const result = await ui.showModal<GlobalPanelLayoutChoice>(
    (close) => (
      <GlobalPanelLayoutConfirmContent hasSaved={hasSaved} close={close} />
    ),
    {
      title: "Share Side Panel Layout",
      size: "sm",
      ariaLabel: "Share Side Panel Layout",
      dismissible: true,
    },
  );
  return result ?? "cancel";
}
