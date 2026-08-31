/**
 * Self-heal for Silo's session hook: rewrites `track-session.sh` when its
 * content has drifted from what the running Silo would generate, and repairs
 * each already-installed agent's own hook config the same way — never
 * installs anything new. See the "Hook Reconcile" roadmap item: today this
 * only runs when {@link AgentsHooksPanel} happens to mount; the point of
 * pulling it out here is so `core.agents-settings`'s `activate()` can also
 * run it once per app launch, so a hook-body change ships and repairs
 * itself on the next launch without anyone opening Settings.
 *
 * Silent and idempotent on a no-op — an already-current install touches no
 * files and logs nothing. `selfHealInstalledHooks` never throws; a self-heal
 * must not block either of its call sites.
 */
import type { ExtensionContext } from "@silo-code/sdk";
import {
  hookInstallableAgents,
  buildTrackSessionScript,
  TRACK_SCRIPT_REL,
  type AgentDefinition,
  type AgentHookResume,
} from "@silo-code/extension-host/internal";
import { installerFor } from "./install-strategy";

export type HookAgent = AgentDefinition & { resume: AgentHookResume };

/** Absolute `$HOME`, or `null` if it can't be resolved (rare) — the same
 * "skip rather than surface an error" contract both call sites rely on. */
export async function resolveHomeDir(
  ctx: ExtensionContext,
): Promise<string | null> {
  try {
    return await ctx.system.homeDir();
  } catch {
    return null;
  }
}

export function settingsPathFor(agent: HookAgent, home: string): string {
  return `${home}/${agent.resume.configPath}`;
}

/** Rewrites the shared capture script if its content has drifted. Returns
 * whether a write happened. */
export async function ensureTrackScript(
  ctx: ExtensionContext,
  home: string,
): Promise<boolean> {
  const path = `${home}/${TRACK_SCRIPT_REL}`;
  const body = buildTrackSessionScript();
  const existing = (await ctx.files.pathExists(path))
    ? await ctx.files.readText(path).catch(() => null)
    : null;
  if (existing === body) return false;
  const dir = path.slice(0, path.lastIndexOf("/"));
  if (dir) await ctx.files.createDir(dir);
  await ctx.files.writeText(path, body);
  return true;
}

/** Rewrites one agent's own config if its hook entry has drifted. Returns
 * whether a write happened. */
export async function refreshConfigIfDrifted(
  ctx: ExtensionContext,
  agent: HookAgent,
  path: string,
): Promise<boolean> {
  return installerFor(agent.resume).refreshIfDrifted(ctx, agent.resume, path);
}

/**
 * The heal itself, given an already-resolved `home` and the agents already
 * known to be installed — the shape {@link AgentsHooksPanel}'s own `load()`
 * already computes in one pass, so it calls this directly rather than
 * re-deriving "installed" a second time.
 */
export async function healInstalledAgents(
  ctx: ExtensionContext,
  home: string,
  installedAgents: readonly HookAgent[],
): Promise<void> {
  if (installedAgents.length === 0) return;
  const scriptWrote = await ensureTrackScript(ctx, home);
  const healed: string[] = [];
  for (const agent of installedAgents) {
    const wrote = await refreshConfigIfDrifted(
      ctx,
      agent,
      settingsPathFor(agent, home),
    );
    if (wrote) healed.push(agent.displayName);
  }
  if (scriptWrote || healed.length > 0) {
    ctx.log.info(
      "Refreshed Silo session hook to the shell-script runtime" +
        (healed.length > 0 ? ` (config: ${healed.join(", ")})` : "") +
        (scriptWrote ? " (wrote track-session.sh)" : "") +
        ".",
    );
  }
}

/**
 * Standalone entry point for `activate()`: resolves everything itself (OS,
 * `$HOME`, which agents are installed) rather than reusing a caller's
 * already-loaded state, since at app startup there is none. Scoped to
 * agents already managed — no new installs, no consent-model change.
 *
 * A per-agent `isInstalled` failure (e.g. a corrupt config) is treated the
 * same as "not installed" and skipped, matching the panel's own per-row
 * error handling — it never blocks healing the other agents.
 */
export async function selfHealInstalledHooks(
  ctx: ExtensionContext,
): Promise<void> {
  try {
    const { os } = await ctx.system.getInfo();
    if (os === "windows") return; // no POSIX hook/config drift to heal there

    const home = await resolveHomeDir(ctx);
    if (!home) return;

    const installed: HookAgent[] = [];
    for (const agent of hookInstallableAgents()) {
      try {
        const isInstalled = await installerFor(agent.resume).isInstalled(
          ctx,
          agent.resume,
          settingsPathFor(agent, home),
        );
        if (isInstalled) installed.push(agent);
      } catch {
        // Same treatment as the panel's per-row error case: nothing to heal
        // if we can't even tell whether it's installed.
      }
    }

    await healInstalledAgents(ctx, home, installed);
  } catch (err) {
    ctx.log.warn(
      "Agent hook self-heal skipped: " +
        (err instanceof Error ? err.message : String(err)),
    );
  }
}
