/**
 * agent-inspector — example extension for ctx.agents (RFC 0018, experimental)
 *
 * Demonstrates:
 *   ctx.agents.getState()        — current AgentInfo[] for the workspace
 *   ctx.agents.subscribe()       — reactive updates, with the allWorkspaces option
 *   ctx.agents.getByTerminalId() — (see TerminalPanel.tsx's own usage; not
 *                                   needed by this panel, which just lists everything)
 *
 * Deliberately scoped to exercise only ctx.agents itself — no tab decorations
 * or workspace status rows (those are unchanged APIs already validated by
 * the separate silo-extensions/agent-monitor extension).
 *
 * Contributes:
 *   • An "Agent Inspector" side panel listing every tracked terminal's
 *     activity, staleness, and resume hint, with an all-workspaces toggle.
 */

import type { Extension, ExtensionContext } from "@silo-code/sdk";
import { AgentInspectorPanel } from "./AgentInspectorPanel";
import styles from "./styles.css";

const STYLE_ID = "silo-agent-inspector-styles";

function activate(ctx: ExtensionContext) {
  injectStyles();

  ctx.subscriptions.push(
    ctx.registerSidePanel({
      id: "silo.agent-inspector",
      location: "right",
      title: "Agent Inspector",
      order: 21,
      lazyMount: true,
      component: () => <AgentInspectorPanel ctx={ctx} />,
    }),
  );
}

function deactivate() {
  document.getElementById(STYLE_ID)?.remove();
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = styles;
  document.head.appendChild(el);
}

export const extension: Extension = {
  id: "silo.agent-inspector",
  activate,
  deactivate,
};
