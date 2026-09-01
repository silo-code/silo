// "Found on this machine" detection for the Profiles tab (RFC 0033 R12). A
// plain, non-interactive `PATH` lookup per catalog agent — POSIX `sh -c
// 'command -v …'` sources nothing, so this deliberately CANNOT see aliases and
// never runs the user's rc file. Run on tab mount and explicit refresh only.

import { getProcessService } from "../process-service";
import { AGENT_CATALOG } from "./agent-catalog";
import { posixSingleQuote } from "./agent-profile-model";

export interface InstalledAgent {
  /** Catalog agent id (also the profile's `assumedAgentId`). */
  id: string;
  /** Catalog display name — the created profile's `label`. */
  displayName: string;
  /** The leader name that resolved — the created profile's `command`. */
  command: string;
  /** Absolute path `command -v` reported, for the card's subtitle. */
  resolvedPath: string;
}

/**
 * For each catalog agent, the first `leaderNames` entry that resolves on
 * `PATH`. Agents already covered by a profile are still returned — the caller
 * filters those out so the list can update as profiles are added.
 */
export async function scanInstalledAgents(): Promise<InstalledAgent[]> {
  const proc = getProcessService();
  const results = await Promise.all(
    AGENT_CATALOG.map(async (agent) => {
      for (const name of agent.leaderNames) {
        try {
          const { stdout, code } = await proc.exec(
            "sh",
            ["-c", `command -v ${posixSingleQuote(name)}`],
            { timeoutMs: 3000 },
          );
          const path = stdout.trim();
          if (code === 0 && path) {
            return {
              id: agent.id,
              displayName: agent.displayName,
              command: name,
              resolvedPath: path,
            } satisfies InstalledAgent;
          }
        } catch {
          // ignore — try the next leader name / agent
        }
      }
      return null;
    }),
  );
  return results.filter((r): r is InstalledAgent => r !== null);
}
