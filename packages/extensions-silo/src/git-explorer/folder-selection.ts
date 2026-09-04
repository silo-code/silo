/**
 * The Branches modal's "which folder" state. The modal's `title` (the folder
 * switcher) and its content (`BranchManager`) are separate elements handed to
 * `ctx.ui.showModal` — siblings under the host's `<Modal>`, not nested inside
 * one another — so they can't share state via props or React context. Both
 * read this external store instead (via `useSyncExternalStore`), the same
 * shared-state-across-independent-instances idiom `pending-worktree-remove.ts`
 * uses for the Worktrees modal.
 */
export interface FolderSelection {
  get(): string;
  set(folder: string): void;
  subscribe(onChange: () => void): () => void;
}

export function createFolderSelection(initial: string): FolderSelection {
  let current = initial;
  const subscribers = new Set<() => void>();
  return {
    get: () => current,
    set(folder) {
      if (folder === current) return;
      current = folder;
      for (const notify of subscribers) notify();
    },
    subscribe(onChange) {
      subscribers.add(onChange);
      return () => subscribers.delete(onChange);
    },
  };
}
