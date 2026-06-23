import type { Extension } from "@silo-code/sdk";

/**
 * The smallest useful Silo extension: one command and one status-bar item.
 * Copy this folder as the starting point for your own extension.
 *
 * It requests **no permissions** (no `silo.permissions` in package.json), so it
 * installs without a consent prompt — the right shape for a starter. See the
 * `permissions-demo` example for how requesting capabilities works.
 */

const STYLE_ID = "silo-hello-styles";

export const extension: Extension = {
  id: "silo.hello",
  activate(ctx) {
    // A command: invocable from code (`ctx.executeCommand`), a keybinding, or a
    // menu. Returns a Disposable, which the host tracks on `ctx.subscriptions`
    // and tears down for you on unload.
    ctx.registerCommand({
      id: "silo.hello.greet",
      label: "Hello: Say hello",
      run: () => ctx.ui.notify("info", "👋 Hello from your extension!"),
    });

    // A status-bar item. The component renders its own content — here a button
    // that runs the command. Style against `--silo-*` design tokens so it
    // themes and font-scales with the app.
    ctx.registerStatusItem({
      id: "hello.status",
      alignment: "left",
      priority: 100,
      component: () => (
        <button
          className="hello-status"
          onClick={() => ctx.executeCommand("silo.hello.greet")}
        >
          👋 Hello
        </button>
      ),
    });

    // A runtime-loaded extension's CSS isn't auto-injected (the host imports only
    // the JS bundle), so inject a <style> on activate and remove it on deactivate.
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .hello-status {
        font: inherit;
        cursor: pointer;
        background: transparent;
        border: 0;
        padding: 0 4px;
        color: inherit;
      }
      .hello-status:hover { color: var(--silo-color-text-hi); }
    `;
    document.head.appendChild(style);
  },
  deactivate() {
    document.getElementById(STYLE_ID)?.remove();
  },
};
