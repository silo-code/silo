import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { applyCliOpen, type CliOpenRequest } from "./open-handler";

/**
 * Wire the `silo <path>` CLI entry point into the running webview.
 *
 * Two delivery paths (see `src-tauri/src/commands/cli.rs`):
 * - **warm** — a second launch is forwarded by `tauri-plugin-single-instance`,
 *   which emits `cli:open`; we listen for it for the app's lifetime.
 * - **cold** — the launching process's arg was stashed before the webview
 *   existed; we drain it once via `cli_consume_launch_args`.
 *
 * Must run *after* workspace hydration so a directory open matches an existing
 * workspace instead of creating a duplicate (see the boot chain in `main.tsx`).
 */
export async function initCliOpenHandler(): Promise<void> {
  await listen<CliOpenRequest>("cli:open", (event) => {
    if (event.payload) applyCliOpen(event.payload);
  });

  const pending = await invoke<CliOpenRequest | null>(
    "cli_consume_launch_args",
  );
  if (pending) applyCliOpen(pending);
}
