import { useLayoutEffect, useRef, useState } from "react";
import type { ExtensionContext } from "@silo-code/sdk";
import { suggestWorktreePath } from "./worktree-model";

/** What the create dialog resolves with (see {@link WorktreeCreateDialog}). */
export interface WorktreeCreateResult {
  /** Absolute path for the new worktree. */
  path: string;
  /** Check out an existing branch, or create a new one from HEAD. */
  branch: { existing: string } | { create: string };
}

export interface WorktreeCreateDialogProps {
  ctx: ExtensionContext;
  /** The repo the worktree is created from (drives the path suggestion). */
  folder: string;
  /** Local branches not already checked out in some worktree. */
  availableBranches: string[];
  /** Resolve the host modal with the form values, or `undefined` to cancel. */
  close: (result?: WorktreeCreateResult) => void;
}

/**
 * The `git worktree add` form, rendered as `ctx.ui.showModal` content. Check
 * out a new branch (default) or an existing one, at a path prefilled with the
 * sibling-directory convention (`<repo>-<branch>`) — the suggestion tracks the
 * branch name until the path is edited by hand. Submits only after confirming
 * the path doesn't already exist. The host owns the modal chrome and title.
 */
export function WorktreeCreateDialog({
  ctx,
  folder,
  availableBranches,
  close,
}: WorktreeCreateDialogProps) {
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [newName, setNewName] = useState("");
  const [existing, setExisting] = useState(availableBranches[0] ?? "");
  const [pathTouched, setPathTouched] = useState(false);
  const [pathValue, setPathValue] = useState(() =>
    suggestWorktreePath(folder, ""),
  );
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const nameRef = useRef<HTMLInputElement | null>(null);

  useLayoutEffect(() => {
    nameRef.current?.focus();
  }, []);

  const branchName = mode === "new" ? newName.trim() : existing;
  const trimmedPath = pathValue.trim();
  const canSubmit =
    !checking &&
    trimmedPath.length > 0 &&
    (mode === "new" ? newName.trim().length > 0 : existing.length > 0);

  // The path suggestion follows the branch name until the user edits the path.
  function syncSuggestion(branch: string) {
    if (!pathTouched) setPathValue(suggestWorktreePath(folder, branch));
  }

  async function submit() {
    if (!canSubmit) return;
    setChecking(true);
    try {
      // files.stat resolves null for absent paths — anything else is taken.
      if ((await ctx.files.stat(trimmedPath)) !== null) {
        setError("That path already exists — pick another.");
        return;
      }
    } catch {
      // Couldn't check (e.g. outside readable scope) — let git be the judge.
    } finally {
      setChecking(false);
    }
    close({
      path: trimmedPath,
      branch: mode === "new" ? { create: newName.trim() } : { existing },
    });
  }

  return (
    <form
      className="silo-modal-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="git-wt-mode" role="radiogroup" aria-label="Branch">
        <label className="git-wt-mode-option">
          <input
            type="radio"
            name="git-wt-mode"
            checked={mode === "new"}
            onChange={() => {
              setMode("new");
              syncSuggestion(newName.trim());
            }}
          />
          New branch
        </label>
        <label className="git-wt-mode-option">
          <input
            type="radio"
            name="git-wt-mode"
            checked={mode === "existing"}
            disabled={availableBranches.length === 0}
            onChange={() => {
              setMode("existing");
              syncSuggestion(existing);
            }}
          />
          Existing branch
        </label>
      </div>

      {mode === "new" ? (
        <>
          <label className="silo-modal-label">New branch name</label>
          <input
            ref={nameRef}
            className="silo-modal-input"
            value={newName}
            placeholder="feature/my-branch"
            onChange={(e) => {
              setNewName(e.target.value);
              syncSuggestion(e.target.value.trim());
            }}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
          />
        </>
      ) : (
        <>
          <label className="silo-modal-label">Branch to check out</label>
          <select
            className="silo-modal-input"
            value={existing}
            onChange={(e) => {
              setExisting(e.target.value);
              syncSuggestion(e.target.value);
            }}
          >
            {availableBranches.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </>
      )}

      <label className="silo-modal-label">Worktree path</label>
      <input
        className="silo-modal-input"
        value={pathValue}
        onChange={(e) => {
          setPathTouched(true);
          setPathValue(e.target.value);
          setError(null);
        }}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
      />
      {error && <div className="git-wt-error">{error}</div>}

      <div className="silo-modal-actions">
        <button type="button" className="silo-button" onClick={() => close()}>
          Cancel
        </button>
        <button
          type="submit"
          className="silo-button-primary"
          disabled={!canSubmit || branchName.length === 0}
        >
          Create
        </button>
      </div>
    </form>
  );
}
