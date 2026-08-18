import { LockOpen, Trash, WarningDiamond } from "@phosphor-icons/react";
import { Button, ModalActions } from "@silo-code/sdk";
import type { RemoveWorktreeDialogModel } from "./remove-worktree-model";

export interface RemoveWorktreeDialogProps {
  model: RemoveWorktreeDialogModel;
  /** Resolve the host modal: `true` to go ahead, anything else cancels. */
  close: (confirmed?: boolean) => void;
}

const EFFECT_ICON = {
  unlock: LockOpen,
  discard: WarningDiamond,
  delete: Trash,
} as const;

/**
 * The Remove worktree confirmation, as `ctx.ui.showModal` content rather than
 * `ctx.ui.confirm` — a locked worktree with uncommitted changes has more to
 * say than one string of prose can carry (ADR 0026's chrome line: the host
 * owns the modal shell, the kit builds what's inside). Every obstacle git
 * would refuse over is stated here, so the user answers once instead of being
 * walked through a chain of prompts.
 */
export function RemoveWorktreeDialog({
  model,
  close,
}: RemoveWorktreeDialogProps) {
  return (
    <div className="git-wt-remove">
      <ul className="git-wt-remove-effects">
        {model.effects.map((effect) => {
          const Icon = EFFECT_ICON[effect.kind];
          const detailed = effect.kind === "discard" && model.files.length > 0;
          return (
            <li
              key={effect.kind}
              className={[
                "git-wt-remove-effect",
                effect.destructive && "git-wt-remove-effect-destructive",
                // Carries a nested file list — needs more room under it than
                // the plain row-to-row rhythm, or the next effect crowds it.
                detailed && "git-wt-remove-effect-detailed",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <Icon size={15} weight="bold" aria-hidden />
              <span className="git-wt-remove-effect-text">{effect.text}</span>
              {/* The files belong to the effect that discards them — nested
                  here, not appended after the list, so they read as that row's
                  detail rather than the next row's. */}
              {detailed && (
                <ul
                  className="git-wt-remove-files"
                  aria-label="Uncommitted files"
                >
                  {model.files.map((file) => (
                    <li key={file}>{file}</li>
                  ))}
                  {model.moreFiles > 0 && (
                    <li className="git-wt-remove-files-more">
                      +{model.moreFiles} more
                    </li>
                  )}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <ModalActions>
        <Button type="button" onClick={() => close(false)}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="danger"
          autoFocus
          onClick={() => close(true)}
        >
          {model.confirmLabel}
        </Button>
      </ModalActions>
    </div>
  );
}
