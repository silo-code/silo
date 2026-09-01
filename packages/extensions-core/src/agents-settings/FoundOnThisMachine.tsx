/**
 * "Found on this machine" (RFC 0033 R12) — sits below the profile list and
 * offers a one-click add for each agent on `PATH` that no profile covers yet.
 * A plain non-interactive `PATH` lookup (it deliberately can't see aliases),
 * run on mount and explicit refresh, never at app start. The section
 * disappears once no cards remain, so it never becomes permanent chrome.
 */
import { useEffect, useState } from "react";
import type { ExtensionContext } from "@silo-code/sdk";
import { AgentIconGlyph, Button, Section } from "@silo-code/sdk";
import {
  addAgentProfile,
  scanInstalledAgents,
  type InstalledAgent,
} from "@silo-code/extension-host/internal";

export function FoundOnThisMachine({
  ctx,
  coveredAgentIds,
  colorScheme,
}: {
  ctx: ExtensionContext;
  /** Agent ids that already have a profile — filtered out of the cards. */
  coveredAgentIds: ReadonlySet<string>;
  colorScheme: "dark" | "light";
}) {
  const [found, setFound] = useState<InstalledAgent[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const catalog = ctx.agents.catalog();

  async function scan() {
    setScanning(true);
    try {
      setFound(await scanInstalledAgents());
    } finally {
      setScanning(false);
    }
  }

  useEffect(() => {
    void scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cards = (found ?? []).filter((f) => !coveredAgentIds.has(f.id));
  if (cards.length === 0 && !scanning && found !== null) return null;

  return (
    <Section
      label="Found on this machine"
      accessory={
        <Button size="sm" onClick={() => void scan()} disabled={scanning}>
          {scanning ? "Scanning…" : "Refresh"}
        </Button>
      }
    >
      <div className="apf-cards">
        {cards.map((f) => (
          <button
            key={f.id}
            type="button"
            className="apf-card"
            onClick={() =>
              addAgentProfile({
                id: profileIdFor(f.id),
                label: f.displayName,
                command: f.command,
                assumedAgentId: f.id,
              })
            }
          >
            <span className="apf-card-icon">
              <AgentIconGlyph
                icon={catalog.find((a) => a.id === f.id)?.icon}
                mode="color"
                colorScheme={colorScheme}
              />
            </span>
            <span className="apf-card-text">
              <span className="apf-card-name">{f.displayName}</span>
              <code className="apf-card-cmd">{f.resolvedPath}</code>
            </span>
            <span className="apf-card-add">Add</span>
          </button>
        ))}
      </div>
    </Section>
  );
}

/** A never-before-seen agent slugs straight to its id; the editor lets the
 *  user change it later. Uniqueness within this session is handled by the
 *  cards disappearing once a profile for the agent exists. */
function profileIdFor(agentId: string): string {
  return agentId.replace(/[^a-z0-9-]/g, "-");
}
