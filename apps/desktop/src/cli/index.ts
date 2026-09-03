import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  applyCliOpen,
  applyCliInstall,
  applyCliInstallFromRegistry,
  applyCliUninstall,
  type CliOpenRequest,
} from "./open-handler";
import { applyCliUsage } from "./usage-handler";

/**
 * A resolved CLI request from `src-tauri/src/commands/cli.rs`.
 *
 * These are the **Forward**-mode commands (ADR 0047): argv is delivered to the
 * running app, which acts on it and reports to the Output panel. The commands
 * whose value is their answer — `silo status`, `silo ws list`,
 * `silo agent run` — are **Control** commands and never arrive here; they are
 * answered on the caller's own stdout before Tauri even starts (RFC 0034).
 *
 * - `open` — open a path (dir, file, or missing)
 * - `install` — install an extension: `path` for a local folder, `id` for a
 *   registry id (`silo install acme.weather`)
 * - `uninstall` — uninstall an extension by id
 * - `agent-usage` / `ws-usage` — a bare `silo agent` / `silo ws`, or an unknown
 *   verb; `id` is the verb when there was one. Both nouns are reserved
 *   (ADR 0047), so neither falls back to opening a folder
 */
type CliRequest =
  | ({ action: "open" } & CliOpenRequest)
  | { action: "install"; path?: string; id?: string }
  | { action: "uninstall"; id: string }
  | { action: "agent-usage"; id?: string }
  | { action: "ws-usage"; id?: string };

function dispatch(req: CliRequest): void {
  if (req.action === "open") {
    applyCliOpen(req);
  } else if (req.action === "install") {
    const run = req.id
      ? applyCliInstallFromRegistry(req.id)
      : applyCliInstall(req.path ?? "");
    run.catch((err) => console.error("[silo cli] install failed:", err));
  } else if (req.action === "uninstall") {
    applyCliUninstall(req.id).catch((err) =>
      console.error("[silo cli] uninstall failed:", err),
    );
  } else if (req.action === "agent-usage") {
    applyCliUsage("agent", req.id);
  } else if (req.action === "ws-usage") {
    applyCliUsage("ws", req.id);
  }
}

/**
 * Wire the `silo` CLI entry point into the running webview.
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
  await listen<CliRequest>("cli:open", (event) => {
    if (event.payload) dispatch(event.payload);
  });

  const pending = await invoke<CliRequest | null>("cli_consume_launch_args");
  if (pending) dispatch(pending);
}
