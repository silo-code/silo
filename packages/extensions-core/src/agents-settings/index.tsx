/**
 * Agents settings page — Install / Uninstall per agent CLI that exposes a
 * session hook (`hookInstallableAgents()` from the agent catalog, the single
 * source of truth). Install writes Silo's hook into that CLI's **default**
 * config location. No per-account (e.g. `CLAUDE_CONFIG_DIR`) differentiation —
 * assumes the CLI's standard setup; the linked "Setup details" docs page
 * covers a non-default setup manually. Installing the hook is what gives
 * `ctx.agents` an exact, PID-correlated session id instead of the
 * honest-but-vague generic hint (see RFC 0018's hook-based resolution). The
 * actual hook-event reading and PID correlation is host-internal, sealed,
 * same as the rest of `ctx.agents`.
 *
 * Installing does two things (RFC 0019): write the shared POSIX-shell capture
 * script (`~/.silo/agent-hooks/track-session.sh`, catalog-templated), then add
 * a one-line hook entry pointing at it. On load the page also **self-heals** —
 * any install still carrying the legacy inline `python3`/base64 command (which
 * tripped endpoint-security tools) is rewritten to the shell runtime, silently
 * unless it actually changes something.
 *
 * On-disk schemas are selected via `resume.installStrategy` through
 * {@link installerFor} (Claude/Codex, Cursor, Copilot). The whole feature is
 * macOS/Linux only — on Windows the page is detection-only (no Install, no
 * self-heal), since a shell hook can neither run nor correlate there.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useSnapshot } from "valtio";
import type { Extension, ExtensionContext } from "@silo-code/sdk";
import {
  Badge,
  Section,
  Callout,
  Button,
  SettingRow,
  Switch,
} from "@silo-code/sdk";
import {
  hookInstallableAgents,
  sessionFileAgents,
  buildTrackSessionScript,
  TRACK_SCRIPT_REL,
  store,
  setTerminalSetting,
  type AgentDefinition,
  type AgentHookResume,
} from "@silo-code/extension-host/internal";
import { installerFor } from "./install-strategy";
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

/** Absolute settings-file path for an agent under the user's home dir. */
function settingsPathFor(agent: HookAgent, home: string): string {
  return `${home}/${agent.resume.configPath}`;
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
  return installerFor(agent.resume).refreshIfDrifted(ctx, agent.resume, path);
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
  await installerFor(agent.resume).write(ctx, agent.resume, path, install);
}

/** Label + hint + docs link on the left; a single control on the right —
 * matches other settings pages (Install / Uninstall alone), instead of cramming badge +
 * link + switch into the control slot. */
function AgentSettingsRow({
  label,
  hint,
  docsUrl,
  onOpenDocs,
  control,
}: {
  label: string;
  hint: string;
  docsUrl: string;
  onOpenDocs: (url: string) => void;
  control?: ReactNode;
}) {
  return (
    <div className="silo-setting-row">
      <div className="silo-setting-row-text">
        <div className="silo-setting-row-label">{label}</div>
        <div className="silo-setting-row-hint">{hint}</div>
        <button
          type="button"
          className="agents-settings-docs-link"
          onClick={() => onOpenDocs(docsUrl)}
        >
          Setup details
        </button>
      </div>
      {control != null && (
        <div className="silo-setting-row-control">{control}</div>
      )}
    </div>
  );
}

function AgentsSettingsPage({ ctx }: { ctx: ExtensionContext }) {
  const [home, setHome] = useState<string | null | undefined>(undefined);
  const [rows, setRows] = useState<AgentRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  // Exact resume needs a POSIX-shell hook that Windows can neither run nor
  // correlate against (RFC 0019 / RFC 0010's ConPTY gap) — the toggles are
  // hidden there and the page is detection-only.
  const [windows, setWindows] = useState(false);
  // A terminal-display setting, surfaced here because this is where a user
  // looks for how agents present themselves (see TerminalSettings).
  const hideGlyphs = useSnapshot(store).terminalSettings.hideAgentStatusGlyphs;

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
        const installed = await installerFor(agent.resume).isInstalled(
          ctx,
          agent.resume,
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

  return (
    <div className="es-page">
      <div className="es-header">
        <h2>Agents</h2>
      </div>

      <div className="es-scroll silo-scroll">
        <Section label="Display">
          <SettingRow
            label="Hide status glyphs in tab titles"
            hint="Strips agent status markers (Claude's ◐/✳, Codex's spinner, Cursor's “ - Working…”) from terminal tab titles."
          >
            <Switch
              checked={hideGlyphs}
              onChange={(checked) =>
                setTerminalSetting("hideAgentStatusGlyphs", checked)
              }
              aria-label="Hide status glyphs in tab titles"
            />
          </SettingRow>
        </Section>

        {/* Both of these scope to session hooks specifically — the WIP caveat is
            about hook-based exact resume, and the Windows gap is that a
            POSIX-shell hook can't run there. Kept adjacent to the hooks section
            rather than at the top of the page, where they read as applying to
            every agent setting. */}
        <p className="agents-settings-banner">
          <Badge tone="warn">Work in progress</Badge> Session hooks and exact
          resume are still evolving. Expect rough edges — feedback welcome.{" "}
          <button
            type="button"
            className="agents-settings-banner-link"
            onClick={() =>
              void ctx.ui.openExternal(
                "https://getsilo.dev/guide/agent-sessions",
              )
            }
          >
            Learn more
          </button>
        </p>

        {windows && (
          <Callout>
            Exact resume via session hooks is macOS and Linux only for now —
            Windows doesn&rsquo;t yet support the POSIX-shell hook and
            process-group tracking it relies on. Silo still detects these agents
            and shows a best-effort resume hint.
          </Callout>
        )}

        <Section label="Session hooks">
          {rows.map((row) => (
            <AgentSettingsRow
              key={row.agent.id}
              label={row.agent.displayName}
              hint={
                row.error
                  ? `Error: ${row.error}`
                  : windows
                    ? "Detection only on this platform"
                    : row.installed
                      ? (row.agent.resume.postInstallNote ??
                        "Hook installed — exact resume enabled.")
                      : "Install Silo's session hook for exact resume."
              }
              docsUrl={row.agent.docsUrl}
              onOpenDocs={(url) => void ctx.ui.openExternal(url)}
              control={
                windows ? undefined : (
                  <Button
                    size="sm"
                    variant={row.installed ? "normal" : "primary"}
                    disabled={busy === row.agent.id || !row.loaded}
                    onClick={() => void toggle(row, !row.installed)}
                  >
                    {row.installed ? "Uninstall" : "Install"}
                  </Button>
                )
              }
            />
          ))}
        </Section>

        {autoAgents.length > 0 && (
          <Section label="Works automatically">
            {autoAgents.map((agent) => (
              <AgentSettingsRow
                key={agent.id}
                label={agent.displayName}
                hint="Uses its native session registry — no hook to install."
                docsUrl={agent.docsUrl}
                onOpenDocs={(url) => void ctx.ui.openExternal(url)}
                control={<Badge tone="ok">Automatic</Badge>}
              />
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}

export const extension: Extension = {
  id: "core.agents-settings",
  activate(ctx) {
    ctx.registerSettingsPage({
      id: "agents",
      title: "Agents",
      // Just above About Silo (9_about): after Extensions (5_*), before About.
      group: "8_agents",
      order: 1,
      component: () => <AgentsSettingsPage ctx={ctx} />,
    });
  },
};
