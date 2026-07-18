import { Button, Callout, ModalActions } from "@silo-code/sdk";
import { buildUpdateLead } from "./model";

/**
 * The pre-install prompt, rendered as the content of `ctx.ui.showModal` (the
 * host owns the card chrome). A dedicated layout — not `ctx.ui.confirm` — so the
 * "save your work" warning can stand on its own line and be emphasized, and the
 * sentences get real paragraph spacing. `onLater` / `onInstall` settle the modal.
 */
export function UpdatePrompt({
  version,
  onLater,
  onInstall,
}: {
  version: string | null;
  onLater: () => void;
  onInstall: () => void;
}) {
  return (
    <div className="update-prompt">
      <div className="update-prompt-title">Update Silo?</div>
      <div className="update-prompt-body">
        <p>{buildUpdateLead(version)}</p>
        <Callout>
          Save your work first — Silo will close and restart to finish updating.
        </Callout>
      </div>
      <ModalActions>
        <Button onClick={onLater}>Later</Button>
        <Button variant="primary" onClick={onInstall}>
          Install & Restart
        </Button>
      </ModalActions>
    </div>
  );
}
