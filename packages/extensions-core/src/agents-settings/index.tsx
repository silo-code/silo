/**
 * Agents settings page — one install toggle per agent CLI that exposes a
 * session hook (`hookInstallableAgents()` from the agent catalog, the single
 * source of truth). Toggling installs/uninstalls Silo's hook into that CLI's
 * **default** config location. No per-account (e.g. `CLAUDE_CONFIG_DIR`)
 * differentiation — the toggle assumes the CLI's standard setup; the linked
 * "Setup details" docs page covers a non-default setup manually. Installing
 * the hook is what gives `ctx.agents` an exact, PID-correlated session id
 * instead of the honest-but-vague generic hint (see RFC 0018's hook-based
 * resolution). The actual hook-event reading and PID correlation is
 * host-internal, sealed, same as the rest of `ctx.agents`.
 *
 * Installing does two things (RFC 0019): write the shared POSIX-shell capture
 * script (`~/.silo/agent-hooks/track-session.sh`, catalog-templated), then add
 * a one-line hook entry pointing at it. On load the page also **self-heals** —
 * any install still carrying the legacy inline `python3`/base64 command (which
 * tripped endpoint-security tools) is rewritten to the shell runtime, silently
 * unless it actually changes something.
 *
 * Three on-disk schemas are supported via `resume.installStrategy`:
 * Claude/Codex (`claude-settings`), Cursor (`cursor-hooks-json`), and
 * Copilot (`copilot-hooks-dir` — dedicated file under `~/.copilot/hooks/`).
 * The whole feature is macOS/Linux only — on Windows the page is detection-only
 * (no toggle, no self-heal), since a shell hook can neither run nor correlate
 * there.
 */
import { useCallback, useEffect, useState } from "react";
import type { Extension, ExtensionContext } from "@silo-code/sdk";
import { Switch, SettingRow, Badge } from "@silo-code/sdk";
import {
  hookInstallableAgents,
  sessionFileAgents,
  buildTrackSessionScript,
  TRACK_SCRIPT_REL,
  type AgentDefinition,
  type AgentHookResume,
} from "@silo-code/extension-host/internal";
import {
  hasHookInstalled,
  withHookInstalled,
  withHookUninstalled,
  type ClaudeSettings,
} from "./hook-installer";
import {
  hasCursorHookInstalled,
  withCursorHookInstalled,
  withCursorHookUninstalled,
  type CursorHooksFile,
} from "./cursor-hook-installer";
import {
  buildCopilotHookFile,
  hasCopilotHookInstalled,
  type CopilotHooksFile,
} from "./copilot-hook-installer";
import "./AgentsSettingsPage.css";

type HookAgent = AgentDefinition & { resume: AgentHookResume };

interface AgentRow {
  agent: HookAgent;
  installed: boolean;
  loaded: boolean;
  error?: string;
}

async function resolveHomeDir(ctx: ExtensionContext): Promise<string | null> {
  try {
    const { code, stdout } = await ctx.process.exec("sh", [
      "-c",
      "printf '%s' \"$HOME\"",
    ]);
    return code === 0 ? stdout.trim() || null : null;
  } catch {
    return null;
  }
}

async function readJsonFile<T extends object>(
  ctx: ExtensionContext,
  path: string,
): Promise<T | null> {
  if (!(await ctx.files.pathExists(path))) return null;
  try {
    const text = await ctx.files.readText(path);
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null ? (parsed as T) : null;
  } catch {
    return null;
  }
}

/** Absolute settings-file path for an agent under the user's home dir. */
function settingsPathFor(agent: HookAgent, home: string): string {
  return `${home}/${agent.resume.configPath}`;
}

async function isInstalled(
  ctx: ExtensionContext,
  agent: HookAgent,
  path: string,
): Promise<boolean> {
  const strategy = agent.resume.installStrategy;
  if (strategy === "cursor-hooks-json") {
    const file = (await readJsonFile<CursorHooksFile>(ctx, path)) ?? {};
    return hasCursorHookInstalled(file, agent.resume);
  }
  if (strategy === "copilot-hooks-dir") {
    const file = await readJsonFile<CopilotHooksFile>(ctx, path);
    return hasCopilotHookInstalled(file, agent.resume);
  }
  const settings = (await readJsonFile<ClaudeSettings>(ctx, path)) ?? {};
  return hasHookInstalled(settings, agent.resume);
}

/**
 * Ensure the shared capture script exists at `~/.silo/agent-hooks/
 * track-session.sh` and matches the current catalog-templated body (RFC 0019).
 * Every installed agent's hook command invokes this one script, so it's written
 * once, not per-agent. Idempotent: writes only when absent or drifted (e.g. the
 * catalog's known-agent list changed), and returns whether it wrote.
 */
async function ensureTrackScript(
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

/**
 * Rewrite an already-installed agent's hook config **only if** its stored
 * command differs from what the catalog now produces — the migration path for
 * legacy base64/`python3` commands (RFC 0019). Relies on the per-strategy
 * installers returning the *same* object by reference when nothing changed, so
 * an already-current install writes nothing. Returns whether it wrote.
 */
async function refreshConfigIfDrifted(
  ctx: ExtensionContext,
  agent: HookAgent,
  path: string,
): Promise<boolean> {
  const strategy = agent.resume.installStrategy;
  if (strategy === "copilot-hooks-dir") {
    const existing = (await ctx.files.pathExists(path))
      ? await ctx.files.readText(path).catch(() => null)
      : null;
    const next =
      JSON.stringify(buildCopilotHookFile(agent.resume), null, 2) + "\n";
    if (existing === next) return false;
    const dir = path.slice(0, path.lastIndexOf("/"));
    if (dir) await ctx.files.createDir(dir);
    await ctx.files.writeText(path, next);
    return true;
  }
  if (strategy === "cursor-hooks-json") {
    const current = (await readJsonFile<CursorHooksFile>(ctx, path)) ?? {};
    const next = withCursorHookInstalled(current, agent.resume);
    if (next === current) return false;
    await ctx.files.writeText(path, JSON.stringify(next, null, 2) + "\n");
    return true;
  }
  const current = (await readJsonFile<ClaudeSettings>(ctx, path)) ?? {};
  const next = withHookInstalled(current, agent.resume);
  if (next === current) return false;
  await ctx.files.writeText(path, JSON.stringify(next, null, 2) + "\n");
  return true;
}

async function writeInstalled(
  ctx: ExtensionContext,
  agent: HookAgent,
  path: string,
  home: string,
  install: boolean,
): Promise<void> {
  // The config command references the shared capture script, so the script has
  // to exist before anything points at it.
  if (install) await ensureTrackScript(ctx, home);

  const dir = path.slice(0, path.lastIndexOf("/"));
  if (dir) await ctx.files.createDir(dir);

  const strategy = agent.resume.installStrategy;
  if (strategy === "copilot-hooks-dir") {
    // Dedicated file: write the full document on install, delete on uninstall.
    if (install) {
      const next = buildCopilotHookFile(agent.resume);
      await ctx.files.writeText(path, JSON.stringify(next, null, 2) + "\n");
    } else if (await ctx.files.pathExists(path)) {
      await ctx.files.delete(path);
    }
    return;
  }

  if (strategy === "cursor-hooks-json") {
    const current = (await readJsonFile<CursorHooksFile>(ctx, path)) ?? {};
    const next = install
      ? withCursorHookInstalled(current, agent.resume)
      : withCursorHookUninstalled(current, agent.resume);
    await ctx.files.writeText(path, JSON.stringify(next, null, 2) + "\n");
    return;
  }

  const current = (await readJsonFile<ClaudeSettings>(ctx, path)) ?? {};
  const next = install
    ? withHookInstalled(current, agent.resume)
    : withHookUninstalled(current, agent.resume);
  await ctx.files.writeText(path, JSON.stringify(next, null, 2) + "\n");
}

function AgentsSettingsPage({ ctx }: { ctx: ExtensionContext }) {
  const [home, setHome] = useState<string | null | undefined>(undefined);
  const [rows, setRows] = useState<AgentRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  // Exact resume needs a POSIX-shell hook that Windows can neither run nor
  // correlate against (RFC 0019 / RFC 0010's ConPTY gap) — the toggles are
  // hidden there and the page is detection-only.
  const [windows, setWindows] = useState(false);

  const load = useCallback(async () => {
    const agents = hookInstallableAgents();
    const { os } = await ctx.system.getInfo();
    const isWindows = os === "windows";
    setWindows(isWindows);
    if (isWindows) {
      // Detection-only: no home resolution (there's no `sh`), no toggles, and
      // never any self-heal — a pre-existing hook synced from another machine
      // is left inert as-is rather than rewritten to a form that still can't
      // run here.
      setHome(null);
      setRows(
        agents.map((agent) => ({ agent, installed: false, loaded: true })),
      );
      return;
    }
    const h = await resolveHomeDir(ctx);
    setHome(h);
    if (!h) {
      setRows(
        agents.map((agent) => ({
          agent,
          installed: false,
          loaded: false,
          error: "Could not resolve $HOME",
        })),
      );
      return;
    }
    const next: AgentRow[] = [];
    for (const agent of agents) {
      try {
        const installed = await isInstalled(
          ctx,
          agent,
          settingsPathFor(agent, h),
        );
        next.push({ agent, installed, loaded: true });
      } catch (err) {
        next.push({
          agent,
          installed: false,
          loaded: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Self-heal on load: migrate any legacy base64/python install to the
    // shell-script runtime just by opening this page. Idempotent — writes only
    // on drift — and silent unless it actually heals, in which case it logs to
    // the extension's Output channel for a diagnostic trail.
    try {
      const installedAgents = next.filter((r) => r.installed);
      if (installedAgents.length > 0) {
        const scriptWrote = await ensureTrackScript(ctx, h);
        const healed: string[] = [];
        for (const r of installedAgents) {
          const wrote = await refreshConfigIfDrifted(
            ctx,
            r.agent,
            settingsPathFor(r.agent, h),
          );
          if (wrote) healed.push(r.agent.displayName);
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
    } catch (err) {
      ctx.log.warn(
        "Agent hook self-heal skipped: " +
          (err instanceof Error ? err.message : String(err)),
      );
    }

    setRows(next);
  }, [ctx]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(row: AgentRow, install: boolean) {
    if (!home) return;
    setBusy(row.agent.id);
    const path = settingsPathFor(row.agent, home);
    try {
      await writeInstalled(ctx, row.agent, path, home, install);
      await load();
    } catch (err) {
      setRows((prev) =>
        prev.map((r) =>
          r.agent.id === row.agent.id
            ? { ...r, error: err instanceof Error ? err.message : String(err) }
            : r,
        ),
      );
    } finally {
      setBusy(null);
    }
  }

  const autoAgents = sessionFileAgents();
  const autoNames = autoAgents.map((a) => a.displayName).join(", ");
  const autoSingular = autoAgents.length === 1;

  return (
    <div className="agents-settings-page">
      <p className="agents-settings-blurb">
        Installing a hook lets Silo identify exactly which session is running in
        a terminal — precise enough to tell two concurrent sessions in the same
        directory apart, and to give an exact resume command if a session's
        backend ever dies unexpectedly (e.g. an OS restart). It only appends one
        hook entry — any other hooks you already have configured (e.g. from
        another tool) are left untouched. Assumes each CLI's default setup; see
        "Setup details" for configuring a non-default setup manually.
      </p>

      {windows && (
        <p className="agents-settings-blurb">
          Exact resume via session hooks is macOS and Linux only for now — it
          relies on a POSIX-shell hook and terminal process-group tracking that
          Windows doesn&rsquo;t yet support. Silo still detects these agents and
          shows a best-effort resume hint.
        </p>
      )}

      {rows.map((row) => (
        <SettingRow
          key={row.agent.id}
          label={row.agent.displayName}
          hint={
            row.error
              ? `Error: ${row.error}`
              : windows
                ? "Detection only on this platform"
                : row.installed
                  ? row.agent.resume.postInstallNote
                  : undefined
          }
        >
          {!windows && row.installed && <Badge tone="ok">Installed</Badge>}
          <a
            className="agents-settings-docs-link"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              void ctx.ui.openExternal(row.agent.docsUrl);
            }}
          >
            Setup details
          </a>
          {!windows && (
            <Switch
              checked={row.installed}
              disabled={busy === row.agent.id || !row.loaded}
              onChange={(checked) => void toggle(row, checked)}
              aria-label={`Install Silo session hook for ${row.agent.displayName}`}
            />
          )}
        </SettingRow>
      ))}

      {autoAgents.length > 0 && (
        <p className="agents-settings-blurb">
          {autoNames} {autoSingular ? "needs" : "need"} no hook — Silo reads{" "}
          {autoSingular ? "its" : "their"} native session registry automatically
          when the CLI is running.
        </p>
      )}
    </div>
  );
}

export const extension: Extension = {
  id: "core.agents-settings",
  activate(ctx) {
    ctx.registerSettingsPage({
      id: "agents",
      title: "Agents",
      group: "5_agents",
      order: 1,
      component: () => <AgentsSettingsPage ctx={ctx} />,
    });
  },
};
