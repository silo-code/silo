import { useState } from "react";
import type { Extension, MenuEntry } from "@silo-code/sdk";

// An example Silo extension: a command — reachable from the View menu or
// cmd+shift+m — that opens a menu of sample toasts (`ctx.ui.notify`) and modals
// (`ctx.ui.showModal` / `confirm` / `prompt` / `showMenu`), a quick way to see
// every notification variant. It touches the app only through `ctx` and the
// public `@silo-code/sdk`, exactly as a third-party extension would.

/* -------------------------------------------------------------------------- */
/* Styles. A runtime-loaded extension's CSS isn't auto-injected (the host only  */
/* imports the JS bundle), so we inject a <style> on activate and remove it on   */
/* deactivate. Consume only `--silo-*` design tokens so it themes correctly and  */
/* scales with uiFontSize.                                                       */
/* -------------------------------------------------------------------------- */

const STYLE_ID = "acme-notify-demo-styles";
const STYLES = `
/* Full detail body shown in the "View details" modal (ctx.ui.showModal). */
.notify-demo-detail {
  max-height: 50vh;
  overflow: auto;
  margin: 0;
  padding: 10px 12px;
  background: var(--silo-color-input-bg);
  border: 1px solid var(--silo-color-border-strong);
  border-radius: var(--silo-radius-sm);
  color: var(--silo-color-text);
  font-family: var(--silo-font-mono);
  font-size: var(--silo-font-size-sm);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
`;

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = STYLES;
  document.head.appendChild(el);
}

function removeStyles(): void {
  document.getElementById(STYLE_ID)?.remove();
}

// A realistic multi-line "full error" body, for the View-details → modal sample.
const SAMPLE_DETAIL = [
  "pre-commit: lint failed",
  "  src/foo.ts:12:3  error  Unexpected token",
  "  src/bar.ts:4:1   error  Missing semicolon",
  "  src/baz.ts:88:5  warning  Unused variable 'tmp'",
  "",
  "commit aborted by pre-commit hook",
].join("\n");

// Small stateful body for the custom-modal sample — closes over the host-owned
// `close` passed down by the parent. Uses the host modal-form classes so it
// matches confirm/prompt chrome.
function DemoForm({
  onCancel,
  onSave,
}: {
  onCancel: () => void;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <form
      className="silo-modal-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(value);
      }}
    >
      <label className="silo-modal-label">Type something, then Save</label>
      <input
        className="silo-modal-input"
        value={value}
        placeholder="anything…"
        onChange={(e) => setValue(e.target.value)}
        autoFocus
      />
      <div className="silo-modal-actions">
        <button type="button" className="silo-button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="silo-button-primary">
          Save
        </button>
      </div>
    </form>
  );
}

export const extension: Extension = {
  id: "acme.notify-demo",
  activate(ctx) {
    injectStyles();
    const ui = ctx.ui;

    // Show some text (e.g. full error output) in a dismissible modal — the
    // "View details" target.
    function showDetailModal(title: string, detail: string) {
      return ui.showModal(
        (close) => (
          <>
            <pre className="notify-demo-detail">{detail}</pre>
            <div className="silo-modal-actions">
              <button
                type="button"
                className="silo-button-primary"
                onClick={() => close()}
              >
                Close
              </button>
            </div>
          </>
        ),
        { title, dismissible: true, size: "lg" },
      );
    }

    async function openFormModal() {
      const result = await ui.showModal<string>(
        (close) => (
          <DemoForm onCancel={() => close()} onSave={(v) => close(v)} />
        ),
        { title: "Demo form", size: "md" },
      );
      ui.notify("info", `Form resolved → ${result ?? "(cancelled)"}`);
    }

    // The menu rebuilt on each open — every row fires one toast/modal variant.
    function items(): MenuEntry[] {
      return [
        { type: "header", label: "Toasts" },
        {
          label: "Info toast",
          run: () => ui.notify("info", "Your changes have been saved."),
        },
        {
          label: "Warning toast",
          run: () =>
            ui.notify("warn", "These could be unsaved changes — double-check."),
        },
        {
          label: "Error toast (sticky)",
          run: () =>
            ui.notify("error", "Please try again later or contact support."),
        },
        {
          label: "With title + body",
          run: () =>
            ui.notify(
              "info",
              "Your profile has been successfully updated with the latest information.",
              { title: "Profile updated" },
            ),
        },
        { type: "separator" },
        { type: "header", label: "Toasts with actions" },
        {
          label: "Error → View details (modal)",
          run: () =>
            ui.notify("error", "pre-commit: lint failed", {
              title: "Commit failed",
              actions: [
                {
                  label: "View details",
                  run: () => showDetailModal("Commit failed", SAMPLE_DETAIL),
                },
              ],
            }),
        },
        {
          label: "Two actions (Retry / Dismiss)",
          run: () =>
            ui.notify("warn", "Couldn't reach the server.", {
              title: "Network error",
              actions: [
                { label: "Retry", run: () => ui.notify("info", "Retrying…") },
                { label: "Dismiss", run: () => {} },
              ],
            }),
        },
        {
          label: "Action keeps toast open",
          run: () =>
            ui.notify("info", "You have 3 unread updates.", {
              title: "Updates",
              actions: [
                {
                  label: "Mark read",
                  keepOpen: true,
                  run: () =>
                    ui.notify("info", "Marked — this toast stays put."),
                },
              ],
            }),
        },
        {
          label: "Auto-dismiss error (2s)",
          run: () =>
            ui.notify("error", "Transient error — gone in 2 seconds.", {
              title: "Heads up",
              durationMs: 2000,
            }),
        },
        { type: "separator" },
        { type: "header", label: "Modals" },
        { label: "Custom modal (form)", run: openFormModal },
        {
          label: "Confirm dialog",
          run: async () => {
            const ok = await ui.confirm({
              title: "Delete workspace?",
              body: "Its saved terminals will be permanently removed.",
              confirmLabel: "Delete",
              danger: true,
            });
            ui.notify("info", `Confirm resolved → ${ok}`);
          },
        },
        {
          label: "Prompt dialog",
          run: async () => {
            const v = await ui.prompt({
              title: "Rename",
              initialValue: "untitled",
            });
            ui.notify("info", `Prompt resolved → ${v ?? "(cancelled)"}`);
          },
        },
      ];
    }

    // Open the sample menu at top-center. It's command-triggered (no status-bar
    // widget), so there's no button to anchor off — `at` places it explicitly.
    function openPlayground() {
      ui.showMenu({
        items: items(),
        at: { x: Math.round(window.innerWidth / 2), y: 96 },
      });
    }

    // One command, reachable two conflict-free ways — the View menu and a
    // keybinding. (There's no command palette yet, so a command needs a
    // trigger to be usable.)
    ctx.registerCommand({
      id: "acme.notify-demo.open",
      label: "Notification Playground",
      run: openPlayground,
    });
    ctx.registerMenuItem({
      id: "notify-demo.view",
      menu: "view",
      command: "acme.notify-demo.open",
    });
    ctx.registerKeybinding({
      id: "notify-demo.open",
      key: "cmd+shift+m",
      command: "acme.notify-demo.open",
    });
  },
  deactivate() {
    removeStyles();
  },
};
