/**
 * Session-hook install UI for the Agents settings page (Hooks tab).
 *
 * Kept in its own module so `agent-catalog-modularization` can land
 * {@link AgentExtraSettingsToggle} changes here without fighting tab/options
 * composition work in `index.tsx`.
 */
import {
  useCallback,
  useEffect,
  useState,
  Fragment,
  type ReactNode,
} from "react";
import type { ExtensionContext } from "@silo-code/sdk";
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
  type AgentDefinition,
  type AgentHookResume,
} from "@silo-code/extension-host/internal";
import { installerFor } from "./install-strategy";
import {
  getTerminalProgress,
  PI_AGENT_SETTINGS_REL,
  withTerminalProgress,
  type PiAgentSettings,
} from "./pi-settings";
import {
  parseSettingsJsonText,
  writableSettingsOrThrow,
  type SettingsJsonRead,
} from "./settings-json";
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

function settingsPathFor(agent: HookAgent, home: string): string {
  return `${home}/${agent.resume.configPath}`;
}

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
  if (install) await ensureTrackScript(ctx, home);
  await installerFor(agent.resume).write(ctx, agent.resume, path, install);
}

async function readPiAgentSettings(
  ctx: ExtensionContext,
  home: string,
): Promise<SettingsJsonRead<PiAgentSettings>> {
  const path = `${home}/${PI_AGENT_SETTINGS_REL}`;
  if (!(await ctx.files.pathExists(path))) return { kind: "missing" };
  const text = await ctx.files.readText(path).catch(() => null);
  return parseSettingsJsonText<PiAgentSettings>(text, path);
}

async function writePiTerminalProgress(
  ctx: ExtensionContext,
  home: string,
  enabled: boolean,
): Promise<void> {
  const path = `${home}/${PI_AGENT_SETTINGS_REL}`;
  const read = await readPiAgentSettings(ctx, home);
  const current = writableSettingsOrThrow(read, path);
  const next = withTerminalProgress(current, enabled);
  const body = JSON.stringify(next, null, 2) + "\n";
  const dir = path.slice(0, path.lastIndexOf("/"));
  if (dir) await ctx.files.createDir(dir);
  await ctx.files.writeText(path, body);
}

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

export function AgentsHooksPanel({ ctx }: { ctx: ExtensionContext }) {
  const [home, setHome] = useState<string | null | undefined>(undefined);
  const [rows, setRows] = useState<AgentRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [piTerminalProgress, setPiTerminalProgress] = useState<boolean | null>(
    null,
  );
  const [piProgressError, setPiProgressError] = useState<string | null>(null);
  const [windows, setWindows] = useState(false);

  const load = useCallback(async () => {
    const agents = hookInstallableAgents();
    const { os } = await ctx.system.getInfo();
    const isWindows = os === "windows";
    setWindows(isWindows);
    if (isWindows) {
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

    setPiProgressError(null);
    try {
      const read = await readPiAgentSettings(ctx, h);
      if (read.kind === "invalid") {
        setPiTerminalProgress(false);
        setPiProgressError(read.message);
      } else {
        setPiTerminalProgress(
          getTerminalProgress(read.kind === "ok" ? read.value : {}),
        );
      }
    } catch (err) {
      setPiTerminalProgress(false);
      setPiProgressError(err instanceof Error ? err.message : String(err));
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

  async function togglePiTerminalProgress(enabled: boolean) {
    if (!home) return;
    setBusy("pi-terminal-progress");
    setPiProgressError(null);
    try {
      await writePiTerminalProgress(ctx, home, enabled);
      setPiTerminalProgress(enabled);
    } catch (err) {
      setPiProgressError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const autoAgents = sessionFileAgents();

  return (
    <>
      <p className="agents-settings-banner">
        <Badge tone="warn">Work in progress</Badge> Session hooks and exact
        resume are still evolving. Expect rough edges — feedback welcome.{" "}
        <button
          type="button"
          className="agents-settings-banner-link"
          onClick={() =>
            void ctx.ui.openExternal("https://getsilo.dev/guide/agent-sessions")
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
          <Fragment key={row.agent.id}>
            <AgentSettingsRow
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
            {row.agent.id === "pi" && !windows && (
              <SettingRow
                label="Terminal progress"
                hint={
                  piProgressError
                    ? `Error: ${piProgressError}`
                    : "Emit OSC 9;4 progress so Silo can show pi working/idle. Restart pi after changing."
                }
              >
                <Switch
                  checked={piTerminalProgress ?? false}
                  disabled={
                    piTerminalProgress === null ||
                    busy === "pi-terminal-progress" ||
                    !home
                  }
                  onChange={(checked) => void togglePiTerminalProgress(checked)}
                  aria-label="pi terminal progress"
                />
              </SettingRow>
            )}
          </Fragment>
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
    </>
  );
}
