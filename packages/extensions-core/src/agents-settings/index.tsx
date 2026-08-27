/**
 * Agents settings page — the single Application-rail entry (`id: "agents"`).
 *
 * **Behavior**, **Navigator**, and **Display** tabs compose host prefs with
 * `silo.agents`' published {@link AgentsExtensionAPI} panels via
 * `ctx.getExtension` — the same bundled-only pattern as `silo.git-explorer` →
 * `silo.git` (no general SDK for extending built-in settings pages). The
 * **Navigator** tab is present only while `silo.agents` is active, since all of
 * its content comes from that extension; **Display** also carries a host-owned
 * tab-title setting, so it stays.
 *
 * **Hooks** tab lives in {@link AgentsHooksPanel} so agent-catalog modularization
 * can evolve hook/extra-settings UI independently.
 */
import { useState, type ComponentType } from "react";
import { useSnapshot } from "valtio";
import type { Extension, ExtensionContext, TabItem } from "@silo-code/sdk";
import { Section, Tabs, TabPanel, SettingRow, Switch } from "@silo-code/sdk";
import { store, setTerminalSetting } from "@silo-code/extension-host/internal";
import { AgentsHooksPanel } from "./AgentsHooksPanel";
import "./AgentsSettingsPage.css";

/** Mirror of `silo.agents`' {@link AgentsExtensionAPI} — core cannot import silo. */
interface SiloAgentsSettingsAPI {
  BehaviorPanel: ComponentType;
  NavigatorPanel: ComponentType;
  DisplayPanel: ComponentType;
}

type AgentsSettingsTab = "behavior" | "navigator" | "display" | "hooks";

/** The live `silo.agents` extension entry, for its `active` flag and API. */
function getSiloAgents(ctx: ExtensionContext) {
  return ctx.getExtension<SiloAgentsSettingsAPI>("silo.agents");
}

/** The live `silo.agents` API, or `null` when that extension isn't active. */
function siloAgentsApi(ctx: ExtensionContext): SiloAgentsSettingsAPI | null {
  const ext = getSiloAgents(ctx);
  return ext?.active ? (ext.api ?? null) : null;
}

function AgentsBehaviorTab({ ctx }: { ctx: ExtensionContext }) {
  const api = siloAgentsApi(ctx);
  return api?.BehaviorPanel != null ? <api.BehaviorPanel /> : null;
}

function AgentsNavigatorTab({ ctx }: { ctx: ExtensionContext }) {
  const api = siloAgentsApi(ctx);
  return api?.NavigatorPanel != null ? <api.NavigatorPanel /> : null;
}

function AgentsDisplayTab({ ctx }: { ctx: ExtensionContext }) {
  const hideGlyphs = useSnapshot(store).terminalSettings.hideAgentStatusGlyphs;
  const api = siloAgentsApi(ctx);

  return (
    <>
      {api?.DisplayPanel != null && <api.DisplayPanel />}
      <Section label="Terminal tabs">
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
  const [tab, setTab] = useState<AgentsSettingsTab>("behavior");

  // The Navigator tab's content is entirely `silo.agents`' — drop the tab
  // when that extension isn't active rather than show an empty panel.
  const hasNavigator = getSiloAgents(ctx)?.active === true;
  const activeTab: AgentsSettingsTab =
    tab === "navigator" && !hasNavigator ? "behavior" : tab;

  const tabs: TabItem<AgentsSettingsTab>[] = [
    { id: "behavior", label: "Behavior" },
    ...(hasNavigator ? [{ id: "navigator" as const, label: "Navigator" }] : []),
    { id: "display", label: "Display" },
    { id: "hooks", label: "Hooks" },
  ];

  return (
    <div className="es-page agents-settings-page">
      <div className="es-header">
        <h2>Agents</h2>
      </div>

      <div className="agents-settings-tabs">
        <Tabs tabs={tabs} active={activeTab} onSelect={setTab} />
        <TabPanel>
          <div className="silo-scroll agents-settings-scroll">
            {activeTab === "behavior" ? (
              <AgentsBehaviorTab ctx={ctx} />
            ) : activeTab === "navigator" ? (
              <AgentsNavigatorTab ctx={ctx} />
            ) : activeTab === "display" ? (
              <AgentsDisplayTab ctx={ctx} />
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
