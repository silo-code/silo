// Host-side coordination for `InlineEdit`'s two-stage Escape (RFC 0016): the
// first Escape cancels an in-progress edit, the next Escape closes the
// enclosing modal. Mirrors `menu-controller.ts`'s `getMenu()` pattern — a
// single piece of module state the modal's own Escape handler checks before
// acting on the key itself — because InlineEdit doesn't have (and doesn't
// need) a document-level keydown listener of its own; `Modal.tsx` already
// owns one.
//
// This intentionally works regardless of the modal's `dismissible` option:
// InlineEdit ships on `Workspace Properties`-style non-dismissible modals
// (protecting other staged input) as often as dismissible ones, and
// cancelling an edit-in-place is a narrower, always-safe action than closing
// the whole modal.

let activeCancel: (() => void) | null = null;

/**
 * @internal Registers the currently-editing `InlineEdit`'s cancel callback.
 * Call with `null` when editing stops for any reason (save, the ✗ button,
 * unmount) so a stale callback never lingers.
 */
export function setActiveInlineEditCancel(cancel: (() => void) | null): void {
  activeCancel = cancel;
}

/**
 * @internal If an `InlineEdit` is mid-edit, cancels it and returns `true`
 * (the caller's Escape handler should stop there, not close the modal).
 * Returns `false` when nothing is being edited.
 */
export function yieldEscapeToInlineEdit(): boolean {
  if (!activeCancel) return false;
  const cancel = activeCancel;
  activeCancel = null;
  cancel();
  return true;
}
