import { useCallback } from "react";
import { useSnapshot } from "valtio";
import { Sheet } from "../extension-host/Sheet";
import {
  getPendingSheetDialog,
  resolveSheetDialog,
  sheetDialogStore,
} from "../extension-host/sheet-dialog";

// Host-rendered chrome for `ctx.layout.openPanelSheet`. Mounted once at the
// App root next to <ModalHost> / <SettingsSheet> / <Toasts>. Renders the one
// imperative sheet queue (sheet-dialog.ts) as `<Sheet anchor="dock">`s,
// passing the `side` the caller already resolved (from the target panel's
// actual current dock) — this host mounts at the app root, not inside any
// side panel's own tree, so it can't rely on `<Sheet>`'s normal DOM-sentinel
// side inference (see Sheet.tsx). Extensions never touch this — they call
// `ctx.layout.openPanelSheet`.

// One open sheet dialog. A dedicated component (keyed by id in the parent) so
// the extension's `render` output owns a stable hook position, and `close`
// keeps a stable identity. Tolerates the entry being already gone — the
// window between `resolveSheetDialog` deleting it and the proxy-driven
// unmount.
function SheetDialogSlot({ id }: { id: string }) {
  const entry = getPendingSheetDialog(id);
  const close = useCallback(() => resolveSheetDialog(id), [id]);
  if (!entry) return null;
  return (
    <Sheet
      anchor="dock"
      side={entry.side}
      mode={entry.options?.mode}
      title={entry.options?.title}
      width={entry.options?.width}
      bare={entry.options?.bare}
      className={entry.options?.className}
      ariaLabel={entry.options?.ariaLabel}
      onClose={close}
    >
      {entry.render(close)}
    </Sheet>
  );
}

export function SheetDialogHost() {
  const snap = useSnapshot(sheetDialogStore);
  return (
    <>
      {snap.entries.map((entry) => (
        <SheetDialogSlot key={entry.id} id={entry.id} />
      ))}
    </>
  );
}
