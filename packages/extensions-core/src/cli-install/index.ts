import type { Extension } from "@silo-code/sdk";
import { installCliShim } from "@silo-code/extension-host/internal";

/**
 * `core.cli-install` — the in-app "Install `silo` command" action.
 *
 * Writes a `silo` shim onto the user's PATH (via the host's `cli_install_shim`,
 * exposed on the privileged internal barrel) so `silo <path>` works from any
 * shell, mirroring VS Code's "Install 'code' command in PATH". Surfaced as a
 * File-menu item; the privileged binary-path resolution + file write happen in
 * the host, so this extension only touches `ctx`.
 */
export const extension: Extension = {
  id: "core.cli-install",
  activate(ctx) {
    ctx.registerCommand({
      id: "core.cli.install",
      label: "Install `silo` Command in PATH",
      run: () => {
        installCliShim()
          .then((message) => ctx.ui.notify("info", message))
          .catch((err) =>
            ctx.ui.notify(
              "error",
              `Could not install the silo command: ${String(err)}`,
            ),
          );
      },
    });
    ctx.registerMenuItem({
      id: "core.cli-install.menu",
      menu: "file",
      command: "core.cli.install",
      group: "8_cli",
      order: 1,
    });
  },
};
