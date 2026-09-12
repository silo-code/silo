/**
 * "Found on this machine" (RFC 0033 R12 / RFC 0038 discovery — `acp-recon.md`
 * §5h). Sits below the profile list and offers a one-click add for each agent
 * on this machine that no profile covers yet. One row per agent, showing the
 * modes it supports (`Terminal · Chat`) and an add button per mode still open.
 *
 * A plain non-interactive install-dir probe (it deliberately can't see
 * aliases), run on mount and explicit refresh, never at app start. The section
 * disappears once no cards remain, so it never becomes permanent chrome.
 */
import { useEffect, useState } from "react";
import type { ExtensionContext } from "@silo-code/sdk";
import { AgentIconGlyph, Button, IconButton } from "@silo-code/sdk";
import { ArrowsClockwise } from "@phosphor-icons/react";
import {
  addAgentProfile,
  chatLaunchForAgent,
  scanInstalledAgents,
  type InstalledAgent,
} from "@silo-code/extension-host/internal";
import {
  foundAgentActions,
  foundAgentModesLabel,
  profileIdForCatalogAgent,
  type AgentMode,
} from "./found-on-machine-model";

export function FoundOnThisMachine({
  ctx,
  coveredModesByAgent,
  existingProfileIds,
  chatHostInstalled,
  colorScheme,
}: {
  ctx: ExtensionContext;
  /** Per agent id, the profile interfaces already covered — a card narrows as
   *  modes are added and drops out once every supported mode is covered. */
  coveredModesByAgent: ReadonlyMap<string, ReadonlySet<AgentMode>>;
  /** Profile ids already in the list — blocks a duplicate one-click add. */
  existingProfileIds: ReadonlySet<string>;
  /** Whether a Chat panel extension is installed to host a Chat profile
   *  (`resolveChatProfileHost()`). With none, only Terminal can be added. */
  chatHostInstalled: boolean;
  colorScheme: "dark" | "light";
}) {
  const [found, setFound] = useState<InstalledAgent[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const catalog = ctx.agents.catalog();

  async function scan({ minSpin = 0 }: { minSpin?: number } = {}) {
    setScanning(true);
    try {
      // The probe is an install-dir stat sweep — it resolves before the
      // spinner can paint. On an explicit rescan, hold it long enough to read
      // as "I did something" (initial mount passes 0 — no reason to delay it).
      const [found] = await Promise.all([
        scanInstalledAgents(),
        minSpin > 0
          ? new Promise((r) => setTimeout(r, minSpin))
          : Promise.resolve(),
      ]);
      setFound(found);
    } finally {
      setScanning(false);
    }
  }

  useEffect(() => {
    void scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emptyModes: ReadonlySet<AgentMode> = new Set();
  const rows = (found ?? []).flatMap((f) => {
    const actions = foundAgentActions(f.id, {
      supportsChat: f.chat !== undefined,
      chatHostInstalled,
      coveredModes: coveredModesByAgent.get(f.id) ?? emptyModes,
      existingProfileIds,
    });
    return actions ? [{ agent: f, actions }] : [];
  });
  if (rows.length === 0 && !scanning && found !== null) return null;

  function add(f: InstalledAgent, mode: AgentMode) {
    const id = profileIdForCatalogAgent(f.id, mode);
    if (existingProfileIds.has(id)) return;
    if (mode === "chat") {
      const launch = chatLaunchForAgent(f.id);
      if (!launch) return; // shouldn't happen — `f.chat` gated the button
      addAgentProfile({
        id,
        label: `${f.displayName} (chat)`,
        launch: {
          interface: "chat",
          command: launch.command,
          args: launch.args,
        },
        assumedAgentId: f.id,
      });
      return;
    }
    addAgentProfile({
      id,
      label: f.displayName,
      launch: { interface: "terminal", command: f.command },
      assumedAgentId: f.id,
    });
  }

  return (
    <div className="apf-found">
      <div className="apf-found-header">
        <span className="silo-section-label">Found on this machine</span>
        <IconButton
          size="sm"
          aria-label="Rescan for installed agents"
          onClick={() => void scan({ minSpin: 550 })}
          disabled={scanning}
        >
          <ArrowsClockwise
            size="1em"
            className={scanning ? "apf-refresh-spin" : undefined}
          />
        </IconButton>
      </div>
      <div className="apf-cards">
        {rows.map(({ agent: f, actions }) => (
          <div key={f.id} className="apf-card">
            <span className="apf-card-icon">
              <AgentIconGlyph
                icon={catalog.find((a) => a.id === f.id)?.icon}
                mode="color"
                colorScheme={colorScheme}
              />
            </span>
            <span className="apf-card-text">
              <span className="apf-card-name">{f.displayName}</span>
              <span className="apf-card-modes">
                {foundAgentModesLabel(f.chat !== undefined)}
                {f.chat?.adapter ? " · adapter downloads on first use" : ""}
              </span>
              <code className="apf-card-cmd">{f.resolvedPath}</code>
            </span>
            <span className="apf-card-actions">
              {actions.terminal && (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => add(f, "terminal")}
                >
                  Add CLI Profile
                </Button>
              )}
              {actions.chat && (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => add(f, "chat")}
                >
                  Add Chat Profile
                </Button>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
