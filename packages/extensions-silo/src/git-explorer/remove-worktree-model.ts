import { worktreeDisplayName } from "./pending-worktree-remove-model";

// What the Remove worktree dialog says, as data. Pure so the wording — the
// part that actually gets argued over — is unit-testable without rendering
// React (see .agents/skills/silo-testing), and so the component stays a
// straight projection of this model rather than branching on state itself.

/** How many uncommitted files the dialog lists before collapsing the rest. */
export const MAX_LISTED_FILES = 5;

/** One thing the removal will do, in the order it happens. */
export interface RemoveWorktreeEffect {
  kind: "unlock" | "discard" | "delete";
  text: string;
  /** Irreversible — the component marks these. */
  destructive: boolean;
}

export interface RemoveWorktreeDialogModel {
  title: string;
  /** Names every irreversible thing the button does (see `confirmLabel`). */
  confirmLabel: string;
  effects: RemoveWorktreeEffect[];
  /** Uncommitted paths to show, capped at {@link MAX_LISTED_FILES}. */
  files: string[];
  /** How many more there are beyond `files`. */
  moreFiles: number;
}

export interface RemoveWorktreeDialogInput {
  worktreePath: string;
  /** Lock reason (`""` when locked without one); `null` when unlocked. */
  locked: string | null;
  /**
   * Uncommitted paths in the worktree, or `null` when the status couldn't be
   * read. `null` and `[]` both mean "say nothing about changes" — the dialog
   * never claims a removal will be clean, it only warns when it knows better.
   */
  dirtyFiles: readonly string[] | null;
}

/**
 * The dialog's content for one worktree. Every case — plain, locked, dirty,
 * both — produces the same shape; obstacles only add effects, so the dialog
 * has one layout instead of four bespoke messages.
 */
export function removeWorktreeDialogModel(
  input: RemoveWorktreeDialogInput,
): RemoveWorktreeDialogModel {
  const { worktreePath, locked, dirtyFiles } = input;
  const name = worktreeDisplayName(worktreePath);
  const files = dirtyFiles ?? [];
  const dirty = files.length > 0;

  const effects: RemoveWorktreeEffect[] = [];
  if (locked != null) {
    const reason = locked.trim();
    effects.push({
      kind: "unlock",
      text: reason ? `Remove the lock (${reason})` : "Remove the lock",
      destructive: false,
    });
  }
  if (dirty) {
    effects.push({
      kind: "discard",
      text: `Discard ${files.length} uncommitted ${files.length === 1 ? "file" : "files"}`,
      destructive: true,
    });
  }
  effects.push({
    kind: "delete",
    text: `Delete ${worktreePath}`,
    destructive: true,
  });

  return {
    title: `Remove worktree "${name}"?`,
    confirmLabel: removeConfirmLabel(locked != null, dirty),
    effects,
    files: files.slice(0, MAX_LISTED_FILES),
    moreFiles: Math.max(0, files.length - MAX_LISTED_FILES),
  };
}

/**
 * The confirm button names every irreversible step it takes — a button that
 * said just "Remove" while the click also discards unsaved work would be the
 * one place in this flow where the label under-promises the damage.
 */
export function removeConfirmLabel(locked: boolean, dirty: boolean): string {
  if (locked && dirty) return "Unlock, Discard and Remove";
  if (locked) return "Unlock and Remove";
  if (dirty) return "Discard and Remove";
  return "Remove";
}
