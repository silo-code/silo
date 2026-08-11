import { useEffect, useState } from "react";
import { Button, Callout, ModalActions } from "@silo-code/sdk";
import type { ExtensionContext } from "@silo-code/sdk";
import type { ChangelogEntry } from "@silo-code/extension-host/internal";
import { TrustedExternalMarkdown } from "../../shared/TrustedExternalMarkdown";
import { buildUpdateLead } from "./model";

const FULL_CHANGELOG_URL = "https://getsilo.dev/changelog";

/**
 * The pre-install prompt, rendered as the content of `ctx.ui.showModal` (the
 * host owns the card chrome). A dedicated layout — not `ctx.ui.confirm` — so
 * the restart reassurance can stand on its own line, the changelog gets real
 * space, and the sentences get real paragraph spacing (ADR 0036).
 *
 * `onLater` / `onSkipVersion` / `onInstall` settle the modal — the caller
 * decides what each does (persist a skip, install, or just dismiss).
 * `loadChangelog` is fetched once on mount; failures resolve to `[]` rather
 * than rejecting, so this component never needs its own error state.
 */
export function UpdatePrompt({
  ctx,
  version,
  loadChangelog,
  onLater,
  onSkipVersion,
  onInstall,
}: {
  ctx: Pick<ExtensionContext, "ui">;
  version: string | null;
  loadChangelog: () => Promise<ChangelogEntry[]>;
  onLater: () => void;
  onSkipVersion: () => void;
  onInstall: () => void;
}) {
  const [changelog, setChangelog] = useState<ChangelogEntry[] | undefined>(
    undefined,
  );

  useEffect(() => {
    let cancelled = false;
    loadChangelog()
      .then((entries) => {
        if (!cancelled) setChangelog(entries);
      })
      .catch(() => {
        if (!cancelled) setChangelog([]);
      });
    return () => {
      cancelled = true;
    };
  }, [loadChangelog]);

  return (
    <div className="update-prompt">
      <div className="update-prompt-title">Update Silo?</div>
      <div className="update-prompt-body">
        <p>{buildUpdateLead(version)}</p>
        <Callout>
          Your workspaces, editors, and terminals are restored automatically
          after the restart.
        </Callout>

        <div className="update-changelog silo-scroll">
          {changelog === undefined ? (
            <span className="ext-hint">Loading changelog…</span>
          ) : (
            changelog.map((entry) => (
              <div className="update-changelog-entry" key={entry.version}>
                <div className="update-changelog-heading">
                  {entry.version}
                  {entry.date && ` — ${entry.date}`}
                </div>
                <TrustedExternalMarkdown ctx={ctx}>
                  {entry.body}
                </TrustedExternalMarkdown>
              </div>
            ))
          )}
          <a
            href="#"
            className="update-changelog-full-link"
            onClick={(e) => {
              e.preventDefault();
              void ctx.ui.openExternal(FULL_CHANGELOG_URL);
            }}
          >
            View full changelog
          </a>
        </div>
      </div>
      <ModalActions
        start={
          <button className="update-skip-link" onClick={onSkipVersion}>
            Skip this version
          </button>
        }
      >
        <Button onClick={onLater}>Later</Button>
        <Button variant="primary" onClick={onInstall}>
          Install & Restart
        </Button>
      </ModalActions>
    </div>
  );
}
