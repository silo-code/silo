import { detectCopilotCLI, detectCopilotTitle } from "../agent-osc-detectors";
import type { AgentDefinition, HookAgentDeps } from "../agent-catalog";

/**
 * GitHub Copilot CLI's catalog entry. Plain data — split out in ADR 0042
 * phase 7 purely for `agent-catalog.ts` navigability, same as every other
 * thin entry; see `catalog/claude.ts` for why it takes `deps` instead of
 * importing the shared hook constants directly.
 */
export function buildCopilotAgentDefinition(
  deps: HookAgentDeps,
): AgentDefinition {
  const { marker, buildHookCommand } = deps;
  return {
    id: "copilot",
    displayName: "GitHub Copilot CLI",
    leaderNames: ["copilot"],
    // Title first: captured live on Windows (2026-08-24), Copilot emitted no
    // OSC 9;4 at all for a whole session, so the progress detector alone left
    // its activity permanently stale. The title is its per-turn signal and also
    // identifies it. OSC 9;4 stays as a second source where it does fire.
    activityDetectors: [detectCopilotTitle, detectCopilotCLI],
    resume: {
      kind: "hook",
      installStrategy: "copilot-hooks-dir",
      // Dedicated file under ~/.copilot/hooks/ — Copilot loads every *.json
      // there, so create/delete is safer than merging settings.json.
      configPath: ".copilot/hooks/silo-managed-agent-hook.json",
      hookEvent: "sessionStart",
      marker,
      buildCommand: () => buildHookCommand("copilot"),
      // Confirmed live (2026-07-28): `copilot --resume=<id>` (and
      // `--resume=<prefix>`); sessionStart payload carries camelCase
      // `sessionId`.
      buildResumeCommand: (sessionId) => `copilot --resume=${sessionId}`,
    },
    docsUrl: "https://getsilo.dev/guide/agent-sessions#github-copilot-cli",
    contract:
      "Exact resume depends on Copilot CLI's sessionStart hook: (1) user-level " +
      "hooks live as *.json files under ~/.copilot/hooks/ with shape " +
      "`{ version: 1, hooks: { sessionStart: [{ type: 'command', command }] } }` " +
      "(also loadable inline in ~/.copilot/settings.json — Silo uses a " +
      "dedicated file so uninstall is delete-only); (2) CONFIRMED live " +
      "(2026-07-28): sessionStart fires with camelCase `sessionId` + `cwd` on " +
      "stdin, including for `copilot -p`; (3) the hook walks parents from its " +
      "PPID to find the agent process and records that process's pgid; (4) " +
      "`copilot --resume=<id>` resumes by that id. Activity comes from " +
      "OSC 9;4 progress notifications — payload '4;<state>' — with state " +
      "1/2/3 = working and state 0/4 = idle. RFC 0033 recon (2026-08-31): " +
      "Copilot has NO config-directory override at all — COPILOT_HOME only " +
      "extends the plugin `pkg` search path, and ~/.copilot is resolved from " +
      "homedir() with no override — so `configDirEnvVar` is undefined. This is " +
      "the case that justifies the recon: string presence alone would have " +
      "produced a field that does nothing.",
    upstreamRefs: [
      "https://docs.github.com/en/copilot/reference/hooks-configuration",
      "https://github.com/github/copilot-cli",
      "https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/overview",
    ],
    lastVerified: "2026-08-31",
  };
}
