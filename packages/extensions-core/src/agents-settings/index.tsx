/**
 * Agents settings page — the single Application-rail entry (`id: "agents"`).
 *
 * **Options** tab composes host display prefs with `silo.agents`' published
 * {@link AgentsExtensionAPI.OptionsPanel} via `ctx.getExtension` — the same
 * bundled-only pattern as `silo.git-explorer` → `silo.git` (no general SDK for
 * extending built-in settings pages).
 *
 * **Hooks** tab lives in {@link AgentsHooksPanel} so agent-catalog modularization
 * can evolve hook/extra-settings UI independently.
 */
import { useState, type ComponentType } from "react";
import { useSnapshot } from "valtio";
import type { Extension, ExtensionContext } from "@silo-code/sdk";
import { Section, Tabs, TabPanel, SettingRow, Switch } from "@silo-code/sdk";
import { store, setTerminalSetting } from "@silo-code/extension-host/internal";
import { AgentsHooksPanel } from "./AgentsHooksPanel";
import "./AgentsSettingsPage.css";

/** Mirror of `silo.agents`' {@link AgentsExtensionAPI} — core cannot import silo. */
interface SiloAgentsSettingsAPI {
  OptionsPanel: ComponentType;
}

type AgentsSettingsTab = "options" | "hooks";

function AgentsOptionsTab({ ctx }: { ctx: ExtensionContext }) {
  const hideGlyphs = useSnapshot(store).terminalSettings.hideAgentStatusGlyphs;
  const siloAgents = ctx.getExtension<SiloAgentsSettingsAPI>("silo.agents");
  const OptionsPanel =
    siloAgents?.active && siloAgents.api?.OptionsPanel
      ? siloAgents.api.OptionsPanel
      : null;

  return (
    <>
      {OptionsPanel != null && <OptionsPanel />}
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
    </>
  );
}

function AgentsSettingsPage({ ctx }: { ctx: ExtensionContext }) {
  const [tab, setTab] = useState<AgentsSettingsTab>("options");

  return (
    <div className="es-page agents-settings-page">
      <div className="es-header">
        <h2>Agents</h2>
      </div>

      <div className="agents-settings-tabs">
        <Tabs
          tabs={[
            { id: "options", label: "Options" },
            { id: "hooks", label: "Hooks" },
          ]}
          active={tab}
          onSelect={setTab}
        />
        <TabPanel>
          <div className="silo-scroll agents-settings-scroll">
            {tab === "options" ? (
              <AgentsOptionsTab ctx={ctx} />
            ) : (
              <AgentsHooksPanel ctx={ctx} />
            )}
          </div>
        </TabPanel>
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
      group: "8_agents",
      order: 1,
      component: () => <AgentsSettingsPage ctx={ctx} />,
    });
  },
};
