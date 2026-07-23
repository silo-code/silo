/**
 * Agents settings page — lists every agent CLI Silo supports session
 * detection for, each with a single toggle that installs/uninstalls Silo's
 * `SessionStart` hook into that CLI's **default** config location. No
 * per-account (e.g. `CLAUDE_CONFIG_DIR`) differentiation here — the toggle
 * assumes the CLI's standard setup; the linked docs page covers configuring
 * a non-default setup manually. Installing the hook is what gives
 * `ctx.agents` an exact, PID-correlated session id instead of falling back
 * to directory/recency inference (see RFC 0017's hook-based resolution
 * addendum). Purely a config-file editor — the actual hook-event reading and
 * PID correlation is host-internal, sealed, same as the rest of `ctx.agents`.
 */
import { useCallback, useEffect, useState } from "react";
import type { Extension, ExtensionContext } from "@silo-code/sdk";
import { Switch, SettingRow, Badge } from "@silo-code/sdk";
import {
  hasHookInstalled,
  withHookInstalled,
  withHookUninstalled,
  type ClaudeSettings,
} from "./hook-installer";
import "./AgentsSettingsPage.css";

interface SupportedAgent {
  id: string;
  label: string;
  /** Path to the CLI's settings file under its **default** config
   * directory — deliberately not account/`CLAUDE_CONFIG_DIR`-aware. */
  settingsPath: (home: string) => string;
  docsUrl: string;
}

const SUPPORTED_AGENTS: SupportedAgent[] = [
  {
    id: "claude",
    label: "Claude Code",
    settingsPath: (home) => `${home}/.claude/settings.json`,
    docsUrl: "https://getsilo.dev/guide/agent-sessions#claude-code",
  },
];

interface AgentRow {
  agent: SupportedAgent;
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

async function readSettings(
  ctx: ExtensionContext,
  path: string,
): Promise<ClaudeSettings> {
  if (!(await ctx.files.pathExists(path))) return {};
  try {
    const text = await ctx.files.readText(path);
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as ClaudeSettings)
      : {};
  } catch {
    return {};
  }
}

function AgentsSettingsPage({ ctx }: { ctx: ExtensionContext }) {
  const [home, setHome] = useState<string | null | undefined>(undefined);
  const [rows, setRows] = useState<AgentRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const h = await resolveHomeDir(ctx);
    setHome(h);
    if (!h) {
      setRows(
        SUPPORTED_AGENTS.map((agent) => ({
          agent,
          installed: false,
          loaded: false,
          error: "Could not resolve $HOME",
        })),
      );
      return;
    }
    const next: AgentRow[] = [];
    for (const agent of SUPPORTED_AGENTS) {
      const settings = await readSettings(ctx, agent.settingsPath(h));
      next.push({ agent, installed: hasHookInstalled(settings), loaded: true });
    }
    setRows(next);
  }, [ctx]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(row: AgentRow, install: boolean) {
    if (!home) return;
    setBusy(row.agent.id);
    const path = row.agent.settingsPath(home);
    try {
      const current = await readSettings(ctx, path);
      const next = install
        ? withHookInstalled(current)
        : withHookUninstalled(current);
      if (install) {
        await ctx.files.createDir(path.slice(0, path.lastIndexOf("/")));
      }
      await ctx.files.writeText(path, JSON.stringify(next, null, 2));
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

      {rows.map((row) => (
        <SettingRow
          key={row.agent.id}
          label={row.agent.label}
          hint={row.error ? `Error: ${row.error}` : undefined}
        >
          {row.installed && <Badge tone="ok">Installed</Badge>}
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
          <Switch
            checked={row.installed}
            disabled={busy === row.agent.id || !row.loaded}
            onChange={(checked) => void toggle(row, checked)}
            aria-label={`Install Silo session hook for ${row.agent.label}`}
          />
        </SettingRow>
      ))}
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
