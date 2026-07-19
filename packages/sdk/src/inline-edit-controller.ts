// Coordination for `InlineEdit`'s two-stage Escape (RFC 0016): the first
// Escape cancels an in-progress edit, the next Escape closes the enclosing
// modal. Mirrors the host's `menu-controller.ts` `getMenu()` pattern — a
// single piece of module state the modal's own Escape handler checks before
// acting on the key itself — because `InlineEdit` doesn't have (and doesn't
// need) a document-level keydown listener of its own; the host's `Modal.tsx`
// already owns one.
//
// Lives in the SDK, not the host, even though only host code (`Modal.tsx`)
// calls `yieldEscapeToInlineEdit`: the dependency only runs one direction
// (extension-host depends on @silo-code/sdk, never the reverse), and
// `InlineEdit` — a public SDK component — is the thing calling
// `setActiveInlineEditCancel`. Exported from the barrel so the host can
// import it like anything else in `@silo-code/sdk`, tagged `@internal` to
// keep it out of the public docs reference — extension authors never call
// these directly.
//
// This intentionally works regardless of the modal's `dismissible` option:
// InlineEdit ships on `Workspace Properties`-style non-dismissible modals
// (protecting other staged input) as often as dismissible ones, and
// cancelling an edit-in-place is a narrower, always-safe action than closing
// the whole modal.

let activeCancel: (() => void) | null = null;

/**
 * Registers the currently-editing `InlineEdit`'s cancel callback so the
 * enclosing modal's Escape handler can yield to it. Call with `null` when
 * editing stops for any reason (save, the ✗ button, unmount) so a stale
 * callback never lingers.
 *
 * @category Consumer Services
 * @internal
 */
export function setActiveInlineEditCancel(cancel: (() => void) | null): void {
  activeCancel = cancel;
}

/**
 * If an `InlineEdit` is mid-edit, cancels it and returns `true` (the
 * caller's Escape handler should stop there, not close the modal). Returns
 * `false` when nothing is being edited.
 *
 * @category Consumer Services
 * @internal
 */
export function yieldEscapeToInlineEdit(): boolean {
  if (!activeCancel) return false;
  const cancel = activeCancel;
  activeCancel = null;
  cancel();
  return true;
}
