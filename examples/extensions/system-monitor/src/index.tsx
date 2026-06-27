import type { Extension, SidePanelProps } from "@silo-code/sdk";
import STYLES from "./styles.css";
import { startPolling } from "./poll";
import { SystemMonitorPanel } from "./views/SystemMonitorPanel";
import { SystemMonitorStatus } from "./views/SystemMonitorStatus";
import { SystemMonitorSettings } from "./views/SystemMonitorSettings";

const STYLE_ID = "silo-system-monitor-styles";

export const extension: Extension = {
  id: "example.system-monitor",
  manifest: {
    name: "System Monitor",
    description:
      "Live CPU and memory charts. Demonstrates ctx.process.exec() as the OS portal — no new SDK surface required.",
  },
  activate(ctx) {
    const styleEl = document.createElement("style");
    styleEl.id = STYLE_ID;
    styleEl.textContent = STYLES;
    document.head.appendChild(styleEl);

    // Polling runs at the extension level — status bar items need live data even
    // when the side panel is hidden. The poll skips metrics not currently visible.
    const stopPolling = startPolling(ctx);
    ctx.subscriptions.push({ dispose: stopPolling });

    ctx.registerSidePanel({
      id: "system-monitor",
      location: "right",
      title: "System",
      component: (props: SidePanelProps) => <SystemMonitorPanel {...props} />,
      order: 20,
      lazyMount: true,
    });

    // Single registration — the component renders chips in the configured order
    // internally, so order changes don't require re-registration.
    ctx.registerStatusItem({
      id: "system-monitor",
      alignment: "right",
      priority: 100,
      component: SystemMonitorStatus,
    });

    ctx.registerSettingsPage({
      id: "example.system-monitor",
      title: "System Monitor",
      component: SystemMonitorSettings,
    });
  },
  deactivate() {
    document.getElementById(STYLE_ID)?.remove();
  },
};
