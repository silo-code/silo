/**
 * Pure logic for installing/uninstalling a Silo session hook as a dedicated
 * file under Copilot CLI's user hooks directory (`~/.copilot/hooks/*.json`).
 *
 * Copilot loads every `*.json` in that directory and merges events, so a
 * Silo-owned file (`silo-managed-agent-hook.json`) is the safest install
 * shape: create on install, delete on uninstall — no surgery of
 * `~/.copilot/settings.json` or sibling hook files.
 *
 * File shape (confirmed against GitHub Copilot hooks reference, 2026-07-28):
 *
 * ```json
 * {
 *   "version": 1,
 *   "hooks": {
 *     "sessionStart": [{ "type": "command", "command": "..." }]
 *   }
 * }
 * ```
 *
 * Confirmed live: CLI `sessionStart` fires with camelCase `sessionId` on
 * stdin; `os.getppid()` correlates to the agent; resume is
 * `copilot --resume=<id>`.
 */

export interface CopilotHooksFile {
  version?: number;
  hooks?: Record<string, CopilotHookEntry[]>;
  [key: string]: unknown;
}

export interface CopilotHookEntry {
  type?: string;
  command?: string;
  bash?: string;
  [key: string]: unknown;
}

export interface CopilotHookInstallSpec {
  /** Lifecycle event, e.g. `"sessionStart"`. */
  hookEvent: string;
  marker: string;
  buildCommand: () => string;
}

function entryCommand(entry: CopilotHookEntry): string | undefined {
  if (typeof entry.command === "string") return entry.command;
  if (typeof entry.bash === "string") return entry.bash;
  return undefined;
}

function isSiloEntry(entry: CopilotHookEntry, marker: string): boolean {
  const cmd = entryCommand(entry);
  return typeof cmd === "string" && cmd.includes(marker);
}

/** Whether a Copilot hooks file already carries Silo's marker under the event. */
export function hasCopilotHookInstalled(
  file: CopilotHooksFile | null | undefined,
  spec: CopilotHookInstallSpec,
): boolean {
  if (!file) return false;
  const entries = file.hooks?.[spec.hookEvent] ?? [];
  return entries.some((e) => isSiloEntry(e, spec.marker));
}

/**
 * Build the full contents of Silo's dedicated Copilot hooks file.
 * Always a fresh document — the file is Silo-owned, not a merge target.
 */
export function buildCopilotHookFile(
  spec: CopilotHookInstallSpec,
): CopilotHooksFile {
  return {
    version: 1,
    hooks: {
      [spec.hookEvent]: [
        {
          type: "command",
          command: spec.buildCommand(),
        },
      ],
    },
  };
}
