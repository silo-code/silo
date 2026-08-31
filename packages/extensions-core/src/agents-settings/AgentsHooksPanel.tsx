/**
 * Session-hook install UI for the Agents settings page (Hooks tab).
 *
 * The per-agent "extra settings" row (pi's Terminal progress toggle, today)
 * renders generically off {@link AgentExtraSettingsToggle} — no
 * `agent.id === "pi"` branch here (ADR 0042 phase 4b).
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
  type AgentExtraSettingsToggle,
} from "@silo-code/extension-host/internal";
import { installerFor } from "./install-strategy";
import {
  resolveHomeDir,
  settingsPathFor,
  ensureTrackScript,
  healInstalledAgents,
  type HookAgent,
} from "./hook-self-heal";
import {
  parseSettingsJsonText,
  writableSettingsOrThrow,
  type SettingsJsonRead,
} from "./settings-json";
import "./AgentsSettingsPage.css";

interface AgentRow {
  agent: HookAgent;
  installed: boolean;
  loaded: boolean;
  error?: string;
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

/** Read+parse an agent's own settings file for its {@link AgentExtraSettingsToggle}
 * — generic over which agent, per ADR 0042 phase 4b (no `agent.id === "pi"`
 * branch here or in any caller). */
async function readExtraSettingsToggleFile(
  ctx: ExtensionContext,
  home: string,
  settingsPathRel: string,
): Promise<SettingsJsonRead<Record<string, unknown>>> {
  const path = `${home}/${settingsPathRel}`;
  if (!(await ctx.files.pathExists(path))) return { kind: "missing" };
  const text = await ctx.files.readText(path).catch(() => null);
  return parseSettingsJsonText<Record<string, unknown>>(text, path);
}

async function writeExtraSettingsToggle(
  ctx: ExtensionContext,
  home: string,
  toggle: AgentExtraSettingsToggle,
  enabled: boolean,
): Promise<void> {
  const path = `${home}/${toggle.settingsPathRel}`;
  const read = await readExtraSettingsToggleFile(
    ctx,
    home,
    toggle.settingsPathRel,
  );
  const current = writableSettingsOrThrow(read, path);
  const next = toggle.setEnabled(current, enabled);
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
  // Keyed by agent id — any hook-installable agent may declare
  // `extraSettingsToggle` (today, only pi does). `undefined` for an id means
  // "not loaded yet" (disables the switch).
  const [toggleState, setToggleState] = useState<Record<string, boolean>>({});
  const [toggleError, setToggleError] = useState<Record<string, string | null>>(
    {},
  );
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
      // Also self-healed at app startup (core.agents-settings' activate,
      // see hook-self-heal.ts) — this call is a harmless, idempotent repeat
      // for whenever the page happens to be open too.
      const installedAgents = next
        .filter((r) => r.installed)
        .map((r) => r.agent);
      await healInstalledAgents(ctx, h, installedAgents);
    } catch (err) {
      ctx.log.warn(
        "Agent hook self-heal skipped: " +
          (err instanceof Error ? err.message : String(err)),
      );
    }

    const nextToggleState: Record<string, boolean> = {};
    const nextToggleError: Record<string, string | null> = {};
    for (const agent of agents) {
      const toggle = agent.extraSettingsToggle;
      if (!toggle) continue;
      try {
        const read = await readExtraSettingsToggleFile(
          ctx,
          h,
          toggle.settingsPathRel,
        );
        if (read.kind === "invalid") {
          nextToggleState[agent.id] = false;
          nextToggleError[agent.id] = read.message;
        } else {
          nextToggleState[agent.id] = toggle.isEnabled(
            read.kind === "ok" ? read.value : {},
          );
          nextToggleError[agent.id] = null;
        }
      } catch (err) {
        nextToggleState[agent.id] = false;
        nextToggleError[agent.id] =
          err instanceof Error ? err.message : String(err);
      }
    }
    setToggleState(nextToggleState);
    setToggleError(nextToggleError);

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

  async function toggleExtraSetting(agent: HookAgent, enabled: boolean) {
    const toggle = agent.extraSettingsToggle;
    if (!toggle || !home) return;
    const busyKey = `${agent.id}-extra-toggle`;
    setBusy(busyKey);
    setToggleError((prev) => ({ ...prev, [agent.id]: null }));
    try {
      await writeExtraSettingsToggle(ctx, home, toggle, enabled);
      setToggleState((prev) => ({ ...prev, [agent.id]: enabled }));
    } catch (err) {
      setToggleError((prev) => ({
        ...prev,
        [agent.id]: err instanceof Error ? err.message : String(err),
      }));
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
            {row.agent.extraSettingsToggle && !windows && (
              <SettingRow
                label={row.agent.extraSettingsToggle.label}
                hint={
                  toggleError[row.agent.id]
                    ? `Error: ${toggleError[row.agent.id]}`
                    : row.agent.extraSettingsToggle.hint
                }
              >
                <Switch
                  checked={toggleState[row.agent.id] ?? false}
                  disabled={
                    toggleState[row.agent.id] === undefined ||
                    busy === `${row.agent.id}-extra-toggle` ||
                    !home
                  }
                  onChange={(checked) =>
                    void toggleExtraSetting(row.agent, checked)
                  }
                  aria-label={`${row.agent.displayName} ${row.agent.extraSettingsToggle.label}`}
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
