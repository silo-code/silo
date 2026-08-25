import { proxy } from "valtio";
import type { ReactNode } from "react";
import type { SheetOptions } from "@silo-code/sdk";
import type { SheetSide } from "./sheet-service";

// The imperative queue behind `ctx.layout.openPanelSheet` — mirrors
// modal-service.ts's `dialogStore`/`pending`/`showModal`/`resolveDialog`
// shape exactly, but for sheets. `side` is resolved by the caller
// (`layout-service.ts`, from the target panel's actual current dock) and
// carried on the entry so `SheetDialogHost` doesn't need to re-derive it.

/** One open imperative sheet, as `SheetDialogHost` needs to see it. */
export interface OpenSheetDialog {
  id: string;
}

/**
 * Queue of open imperative sheets, rendered by `SheetDialogHost`. Extensions
 * never touch this — they call `ctx.layout.openPanelSheet`.
 */
export const sheetDialogStore = proxy<{ entries: OpenSheetDialog[] }>({
  entries: [],
});

/** The non-serializable half of an open sheet dialog, kept off the proxy and
 * keyed by entry id — a callback and a possibly-ReactNode `title` can't live
 * in a valtio snapshot (same reason `modal-service.ts` keeps a `pending` map). */
interface PendingSheetDialog {
  resolve: () => void;
  render: (close: () => void) => ReactNode;
  options?: SheetOptions;
  side: SheetSide;
}

const pending = new Map<string, PendingSheetDialog>();

let nextId = 0;

/** @internal — backs {@link LayoutService.openPanelSheet}. */
export function showSheetDialog(
  render: (close: () => void) => ReactNode,
  options: SheetOptions | undefined,
  side: SheetSide,
): Promise<void> {
  const id = `sheet-dialog-${nextId++}`;
  return new Promise<void>((resolve) => {
    pending.set(id, { resolve, render, options, side });
    sheetDialogStore.entries.push({ id });
  });
}

/**
 * @internal — the `render`/`options`/`side` for an open sheet dialog (or
 * `undefined` once it has settled). Read by `SheetDialogHost`.
 */
export function getPendingSheetDialog(
  id: string,
): PendingSheetDialog | undefined {
  return pending.get(id);
}

/**
 * @internal — settle a sheet dialog: resolve its promise and drop the entry.
 * Idempotent — a second call (e.g. a double-close) is a no-op.
 */
export function resolveSheetDialog(id: string): void {
  const entry = pending.get(id);
  pending.delete(id);
  const i = sheetDialogStore.entries.findIndex((e) => e.id === id);
  if (i !== -1) sheetDialogStore.entries.splice(i, 1);
  entry?.resolve();
}
