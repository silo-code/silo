/**
 * process-monitor — example extension for ctx.processes
 *
 * Demonstrates:
 *   ctx.processes.getState()       — current ProcessInfo[] for the workspace
 *   ctx.processes.subscribe()      — reactive updates (via useServiceState)
 *   ctx.processes.getByTerminalId()— look up a terminal's process by tab id
 *   ctx.processes.kill(pgid)       — surgical kill, shell stays alive
 *   ctx.processes.enableStats()    — opt-in CPU + memory polling
 *
 * Contributes:
 *   • A "Process Monitor" side panel listing every terminal's foreground
 *     process with status, cwd, optional stats, and a kill button.
 *   • A status-bar item showing the count of active (non-idle) processes.
 */

import type { Extension, ExtensionContext } from "@silo-code/sdk";
import { useServiceState } from "@silo-code/sdk";
import { ProcessMonitorPanel } from "./ProcessMonitorPanel";
import styles from "./styles.css";

const STYLE_ID = "silo-process-monitor-styles";

// ---- Status bar item -------------------------------------------------------

function ProcessStatusItem({ ctx }: { ctx: ExtensionContext }) {
  // useServiceState re-renders whenever ctx.processes notifies.
  const procs = useServiceState(ctx.processes);
  const active = procs.filter((p) => !p.atPrompt).length;

  if (active === 0) {
    return (
      <span className="pm-status-item">
        <span className="pm-status-dot" />
        idle
      </span>
    );
  }

  return (
    <span className="pm-status-item pm-status-item--active">
      <span className="pm-status-dot" />
      {active} running
    </span>
  );
}

// ---- Activation ------------------------------------------------------------

function activate(ctx: ExtensionContext) {
  injectStyles();

  // Side panel — the main demo surface.
  ctx.subscriptions.push(
    ctx.registerSidePanel({
      id: "silo.process-monitor",
      location: "right",
      title: "Process Monitor",
      order: 20,
      lazyMount: true,
      component: () => <ProcessMonitorPanel ctx={ctx} />,
    }),
  );

  // Status bar item — shows active process count at a glance.
  // StatusItem.component is a React.ComponentType with no props; capture ctx
  // via closure so the component can read ctx.processes.
  const StatusComponent = () => <ProcessStatusItem ctx={ctx} />;
  ctx.subscriptions.push(
    ctx.registerStatusItem({
      id: "silo.process-monitor.status",
      alignment: "right",
      priority: 10,
      component: StatusComponent,
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
  id: "silo.process-monitor",
  activate,
  deactivate,
};
