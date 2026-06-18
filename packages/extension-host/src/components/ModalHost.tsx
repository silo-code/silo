import { useCallback, useEffect, useRef, useState } from "react";
import { useSnapshot } from "valtio";
import { Modal, ModalActions } from "../extension-host/Modal";
import {
  dialogStore,
  getCustomModal,
  modalStack,
  resolveDialog,
  type DialogEntry,
} from "../extension-host/modal-service";

// Host-rendered chrome for `ctx.ui.confirm` / `ctx.ui.prompt` / `ctx.ui.showModal`.
// Mounted once at the App root next to <SettingsDialog> / <Toasts> / <Menus>.
// Renders the one imperative dialog queue (modal-service.ts) as <Modal>-based
// dialogs, and owns the global body scroll-lock while ANY modal is open (custom
// <Modal>s included, via the shared modalStack). Extensions never touch this —
// they call `ctx.ui.confirm` / `ctx.ui.prompt` / `ctx.ui.showModal`, or (core
// only) render their own <Modal>.

function ConfirmDialog({
  entry,
}: {
  entry: Extract<DialogEntry, { kind: "confirm" }>;
}) {
  const { id, opts } = entry;
  return (
    <Modal
      title={opts.title}
      ariaLabel={opts.title}
      size="sm"
      dismissible
      onClose={() => resolveDialog(id, false)}
    >
      {opts.body && <div className="silo-modal-body">{opts.body}</div>}
      <ModalActions>
        <button
          type="button"
          className="silo-button"
          onClick={() => resolveDialog(id, false)}
        >
          {opts.cancelLabel ?? "Cancel"}
        </button>
        <button
          type="button"
          className={opts.danger ? "silo-button-danger" : "silo-button-primary"}
          onClick={() => resolveDialog(id, true)}
          autoFocus
        >
          {opts.confirmLabel ?? "OK"}
        </button>
      </ModalActions>
    </Modal>
  );
}

function PromptDialog({
  entry,
}: {
  entry: Extract<DialogEntry, { kind: "prompt" }>;
}) {
  const { id, opts } = entry;
  const [value, setValue] = useState(opts.initialValue ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  // Focus on mount and select the pre-filled value so typing replaces it.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);
  return (
    <Modal
      title={opts.title}
      ariaLabel={opts.title}
      size="sm"
      dismissible
      onClose={() => resolveDialog(id, null)}
    >
      <form
        className="silo-modal-form"
        onSubmit={(e) => {
          e.preventDefault();
          resolveDialog(id, value);
        }}
      >
        {opts.label && <label className="silo-modal-label">{opts.label}</label>}
        <input
          ref={inputRef}
          className="silo-modal-input"
          value={value}
          placeholder={opts.placeholder}
          onChange={(e) => setValue(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <ModalActions>
          {opts.resetLabel && (
            // Resolve with "" — the "clear the value" signal the caller acts on.
            // marginRight:auto floats it left, away from Cancel/OK.
            <button
              type="button"
              className="silo-button"
              style={{ marginRight: "auto" }}
              onClick={() => resolveDialog(id, "")}
            >
              {opts.resetLabel}
            </button>
          )}
          <button
            type="button"
            className="silo-button"
            onClick={() => resolveDialog(id, null)}
          >
            {opts.cancelLabel ?? "Cancel"}
          </button>
          <button type="submit" className="silo-button-primary">
            {opts.confirmLabel ?? "OK"}
          </button>
        </ModalActions>
      </form>
    </Modal>
  );
}

// One open `ctx.ui.showModal`. A dedicated component (keyed by id in the parent)
// so the extension's `render` output owns a stable hook position, and `close`
// keeps a stable identity. Tolerates the entry being already gone — the window
// between `resolveDialog` deleting it and the proxy-driven unmount.
function CustomModalSlot({ id }: { id: string }) {
  const entry = getCustomModal(id);
  const close = useCallback(
    (result?: unknown) => resolveDialog(id, result),
    [id],
  );
  if (!entry?.render) return null;
  return (
    <Modal {...entry.options} onClose={close}>
      {entry.render(close)}
    </Modal>
  );
}

export function ModalHost() {
  const dlg = useSnapshot(dialogStore);
  const stack = useSnapshot(modalStack);
  const anyOpen = stack.ids.length > 0;

  // Lock body scroll while any modal (built-in or custom) is open.
  useEffect(() => {
    if (!anyOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [anyOpen]);

  return (
    <>
      {dlg.entries.map((entry) => {
        if (entry.kind === "confirm")
          return <ConfirmDialog key={entry.id} entry={entry} />;
        if (entry.kind === "prompt")
          return <PromptDialog key={entry.id} entry={entry} />;
        return <CustomModalSlot key={entry.id} id={entry.id} />;
      })}
    </>
  );
}
