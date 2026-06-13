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
        <p className="update-prompt-warn">
          Save your work first — Silo will close and restart to finish updating.
        </p>
      </div>
      <div className="update-prompt-actions">
        <button className="silo-button" onClick={onLater}>
          Later
        </button>
        <button className="silo-button-primary" onClick={onInstall}>
          Install &amp; Restart
        </button>
      </div>
    </div>
  );
}
