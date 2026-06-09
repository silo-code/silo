import { proxy } from "valtio";
import type { ReactNode } from "react";
import type {
  ConfirmOptions,
  ModalOptions,
  PromptOptions,
} from "@silo-code/sdk";

// The host-owned modal authority. Two concerns, both of which a single
// host-side arbiter must own (CSS and the `.silo-*` class firewall can't):
//
// 1. **Stacking.** `modalStack.ids` is the ordered list of every open modal's
//    id — custom `<Modal>` and built-in `confirm`/`prompt` alike. A modal's
//    z-index is derived from its index here (see Modal.tsx), so z-order is
//    assigned centrally instead of by hand-picked numbers racing each other.
//    The last id is topmost; only it traps focus.
//
// 2. **Imperative dialogs.** `confirm`/`prompt`/`showModal` push an entry into
//    the one `dialogStore` queue and return a promise. The non-serializable
//    halves — every dialog's `resolve`, plus a custom modal's `render` callback
//    and chrome `options` (which may carry a ReactNode `title`) — are kept OUT
//    of the proxy in a side `Map` (`pending`), since functions and React nodes
//    don't belong in a valtio snapshot. `resolveDialog` looks the entry up,
//    settles, and removes it in one step, for all three kinds. So a `confirm`
//    or `prompt` entry carries its serializable `opts` inline; a `custom` entry
//    carries only its id+kind, with its payload in `pending`.
//
// Mirrors the toast/menu pattern (ui-service.ts / menu-controller.ts): one
// piece of app-shell state + a host component (`ModalHost`) that renders it.
// Extensions reach confirm/prompt/showModal via `ctx.ui`; the `<Modal>`
// component talks to the stacking half directly.

/**
 * Ordered ids of every open modal — the single source of z-order and "who is
 * topmost." Mutated by {@link pushModal} / {@link removeModal} as `<Modal>`s
 * mount and unmount; read by `Modal.tsx` (for its z-index + focus-trap gating)
 * and `ModalHost` (for body scroll-lock).
 *
 * @internal
 */
export const modalStack = proxy<{ ids: string[] }>({ ids: [] });

let nextId = 0;

/** @internal — mint a unique modal id (also used for dialog-entry keys). */
export function nextModalKey(): string {
  return `modal-${nextId++}`;
}

/** @internal — register a modal at the top of the stack (no-op if present). */
export function pushModal(id: string): void {
  if (!modalStack.ids.includes(id)) modalStack.ids.push(id);
}

/** @internal — remove a modal from the stack (on unmount). */
export function removeModal(id: string): void {
  const i = modalStack.ids.indexOf(id);
  if (i !== -1) modalStack.ids.splice(i, 1);
}

/**
 * Host-only prompt options — widens the public {@link PromptOptions} with extras
 * the SDK surface deliberately omits. Currently a third "reset" button that
 * resolves the prompt with `""` (the existing "clear the value" semantics).
 *
 * @internal
 */
export interface InternalPromptOptions extends PromptOptions {
  /** When set, renders a third button that resolves the prompt with `""`. */
  resetLabel?: string;
}

/**
 * One queued imperative dialog. The `confirm`/`prompt` kinds carry their
 * serializable `opts` inline; the `custom` kind (`ctx.ui.showModal`) carries
 * only id+kind, with its non-serializable `render`/`options` held in the side
 * {@link PendingDialog} map. Every dialog's `resolve` lives there too, so this
 * stays a plain valtio snapshot.
 *
 * @internal
 */
export type DialogEntry =
  | { id: string; kind: "confirm"; opts: ConfirmOptions }
  | { id: string; kind: "prompt"; opts: InternalPromptOptions }
  | { id: string; kind: "custom" };

/**
 * Queue of open dialogs, rendered (and z-ordered with everything else) by
 * `ModalHost`. Extensions never touch this — they call `ctx.ui.confirm` /
 * `ctx.ui.prompt` / `ctx.ui.showModal`.
 *
 * @internal
 */
export const dialogStore = proxy<{ entries: DialogEntry[] }>({ entries: [] });

/**
 * The non-serializable half of an open dialog, kept off the proxy and keyed by
 * entry id: always the promise `resolve`, plus — for a `ctx.ui.showModal` custom
 * modal — the `render` callback and chrome `options` (a callback and a
 * possibly-ReactNode `title` can't live in a valtio snapshot).
 */
interface PendingDialog {
  resolve: (value: never) => void;
  render?: (close: (result?: unknown) => void) => ReactNode;
  options?: ModalOptions;
}

// Pending dialogs' non-serializable state, keyed by entry id. Off the proxy.
const pending = new Map<string, PendingDialog>();

/** @internal — backs {@link UiService.confirm}. */
export function confirm(opts: ConfirmOptions): Promise<boolean> {
  const id = nextModalKey();
  return new Promise<boolean>((resolve) => {
    pending.set(id, { resolve: resolve as (value: never) => void });
    dialogStore.entries.push({ id, kind: "confirm", opts });
  });
}

/** @internal — backs {@link UiService.prompt}. */
export function prompt(opts: InternalPromptOptions): Promise<string | null> {
  const id = nextModalKey();
  return new Promise<string | null>((resolve) => {
    pending.set(id, { resolve: resolve as (value: never) => void });
    dialogStore.entries.push({ id, kind: "prompt", opts });
  });
}

/** @internal — backs {@link @silo-code/sdk!UiService.showModal}. */
export function showModal(
  render: (close: (result?: unknown) => void) => ReactNode,
  options?: ModalOptions,
): Promise<unknown> {
  const id = nextModalKey();
  return new Promise<unknown>((resolve) => {
    pending.set(id, {
      resolve: resolve as (value: never) => void,
      render,
      options,
    });
    dialogStore.entries.push({ id, kind: "custom" });
  });
}

/**
 * @internal — the `render`/`options` for an open custom modal (or `undefined`
 * once it has settled). Read by `ModalHost`'s custom-modal slot.
 */
export function getCustomModal(id: string): PendingDialog | undefined {
  return pending.get(id);
}

/**
 * @internal — settle a dialog of any kind: resolve its promise with `value` and
 * drop the entry from the store. Idempotent — a second call (e.g. a custom
 * modal's double-`close`) is a no-op. Called by the host `ConfirmDialog` /
 * `PromptDialog` / custom-modal slot on the user's choice (or dismiss).
 */
export function resolveDialog(id: string, value: unknown): void {
  const entry = pending.get(id);
  pending.delete(id);
  const i = dialogStore.entries.findIndex((e) => e.id === id);
  if (i !== -1) dialogStore.entries.splice(i, 1);
  entry?.resolve(value as never);
}
