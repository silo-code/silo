import type { Extension, SidePanelProps } from "@silo-code/sdk";
import { startPolling } from "./poll";
import { SystemMonitorPanel } from "./panel";
import { SystemMonitorStatusGroup } from "./status";
import { SystemMonitorSettingsPage } from "./settings-page";

// ─── Global CSS ───────────────────────────────────────────────────────────────

const STYLE_ID = "silo-system-monitor-styles";
const STYLES = `
/* ─── Container ──────────────────────────────────────────────────────────── */
.sysmon {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--silo-color-bg);
  color: var(--silo-color-text);
  font-family: var(--silo-font-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif);
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
  font-size: 12px;
}

/* ─── Gear button (fades in on panel hover) ──────────────────────────────── */
.sm-gear-btn {
  position: absolute;
  top: 7px;
  right: 8px;
  z-index: 2;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  color: var(--silo-color-text-lo);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s, background 0.1s, color 0.1s;
}
.sysmon:hover .sm-gear-btn { opacity: 1; }
.sm-gear-btn:hover { color: var(--silo-color-text); background: var(--silo-color-border); }
.sm-gear-btn:focus-visible { opacity: 1; outline: 2px solid var(--silo-color-accent, #4493f8); }

/* ─── Panels container ───────────────────────────────────────────────────── */
.sm-panels {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  flex: 1;
}

/* ─── Cards ──────────────────────────────────────────────────────────────── */
.sm-card {
  display: flex;
  flex-direction: column;
  padding: 11px 13px;
  border-bottom: 1px solid var(--silo-color-border);
  flex-shrink: 0;
}
.sm-mini-cpu { height: 200px; }

/* ─── Header row ─────────────────────────────────────────────────────────── */
.sm-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 9px;
  flex-shrink: 0;
}
.sm-title {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--silo-color-text-lo);
}
.sm-headline {
  font-size: 11px;
  font-weight: 600;
  color: var(--silo-color-text);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.01em;
}

/* ─── Memory body ────────────────────────────────────────────────────────── */
.sm-mem-body { display: flex; align-items: center; gap: 12px; }
.sm-legend { display: flex; flex-direction: column; gap: 5px; flex: 1; min-width: 0; }
.sm-legend-row { display: flex; align-items: center; gap: 5px; font-size: 10px; line-height: 1; }
.sm-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.sm-leg-label { flex: 1; color: var(--silo-color-text-lo); }
.sm-leg-val { color: var(--silo-color-text); font-variant-numeric: tabular-nums; font-size: 10px; }

/* ─── CPU chart ──────────────────────────────────────────────────────────── */
.sm-chart-wrap {
  flex: 1;
  min-height: 0;
  border-radius: 4px;
  background: var(--silo-color-input-bg);
  overflow: hidden;
  position: relative;
}

@keyframes sm-bar-in {
  from { opacity: 0; transform: translateX(4px); }
  to   { opacity: 1; transform: translateX(0); }
}
.sm-bar-new { animation: sm-bar-in 180ms ease-out; }

/* ─── CPU footer ─────────────────────────────────────────────────────────── */
.sm-cpu-footer { display: flex; align-items: center; gap: 14px; margin-top: 8px; flex-shrink: 0; }
.sm-cpu-leg { display: flex; align-items: center; gap: 5px; font-size: 10px; color: var(--silo-color-text-lo); }
.sm-cpu-pct { font-weight: 600; color: var(--silo-color-text); font-variant-numeric: tabular-nums; margin-left: 2px; }

/* ─── States ─────────────────────────────────────────────────────────────── */
.sm-waiting {
  display: flex; align-items: center; justify-content: center;
  height: 100%; color: var(--silo-color-text-lo); font-size: 10px; letter-spacing: 0.05em;
}
.sm-error {
  padding: 14px; color: var(--silo-color-err, #f47067);
  font-size: 10px; line-height: 1.7; white-space: pre-wrap;
}

/* ─── Settings overlay ───────────────────────────────────────────────────── */
.sm-settings {
  display: flex; flex-direction: column;
  height: 100%; overflow-y: auto;
}
.sm-settings-header {
  padding: 7px 8px 8px;
  border-bottom: 1px solid var(--silo-color-border);
  flex-shrink: 0;
}
.sm-back-btn {
  background: none; border: none; cursor: pointer; padding: 3px 6px;
  border-radius: 3px; color: var(--silo-color-text-lo);
  display: flex; align-items: center; gap: 5px;
  font-size: 11px; font-family: inherit; line-height: 1;
}
.sm-back-btn:hover { color: var(--silo-color-text); background: var(--silo-color-border); }
.sm-settings-section {
  padding: 12px 14px;
  border-bottom: 1px solid var(--silo-color-border);
  display: flex; flex-direction: column; gap: 9px;
}
.sm-settings-label {
  font-size: 10px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--silo-color-text-lo);
}
.sm-settings-row {
  display: flex; align-items: center; justify-content: space-between;
}
.sm-settings-check {
  display: flex; align-items: center; gap: 7px;
  font-size: 11px; cursor: pointer;
  color: var(--silo-color-text); user-select: none;
}
.sm-settings-check input[type="checkbox"] {
  width: 13px; height: 13px; cursor: pointer;
  accent-color: var(--silo-color-accent, #4493f8);
}
.sm-reorder-btns { display: flex; gap: 3px; }
.sm-reorder-btns button {
  background: none; border: 1px solid var(--silo-color-border);
  border-radius: 3px; cursor: pointer;
  color: var(--silo-color-text-lo);
  font-size: 8px; padding: 2px 5px; line-height: 1.2;
}
.sm-reorder-btns button:hover:not(:disabled) { color: var(--silo-color-text); background: var(--silo-color-border); }
.sm-reorder-btns button:disabled { opacity: 0.3; cursor: default; }

/* ─── Drag-and-drop reorder (settings page — Side Panels section) ─────────── */
.sms-draggable-row {
  cursor: default;
  transition: opacity 0.15s, background 0.1s;
}
.sms-panel-controls { gap: 8px; }
.sms-grip {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 0;
  color: var(--silo-color-text-lo);
  cursor: grab;
  touch-action: none;
}
.sms-grip:active { cursor: grabbing; }
.sms-draggable-row:hover .sms-grip { color: var(--silo-color-text); }
.sms-dragging { opacity: 0.4; }
.sms-drop-target {
  background: var(--silo-color-bg-active);
  border-top: 2px solid var(--silo-color-accent);
  margin-top: -1px;
}

/* ─── Status bar items ───────────────────────────────────────────────────── */
/* font-size and font-family are NOT set here — they inherit from .status-bar
   (font-size: calc(var(--silo-font-size-base) + 1px)). Extensions should rely
   on this inheritance by default; override only with design tokens when a
   deliberate visual distinction is needed (e.g. two-tone label/value below). */
.sm-status-item {
  display: flex; align-items: center; gap: 3px;
  padding: 0 6px; height: 100%;
  white-space: nowrap; cursor: default;
  font-variant-numeric: tabular-nums;
  color: var(--silo-color-text-lo);
}
.sm-status-val { font-weight: 500; color: var(--silo-color-text); }
`;

// ─── Extension entry ──────────────────────────────────────────────────────────

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
    // when the side panel is hidden.
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
      component: SystemMonitorStatusGroup,
    });

    ctx.registerSettingsPage({
      id: "example.system-monitor",
      title: "System Monitor",
      component: SystemMonitorSettingsPage,
    });
  },
  deactivate() {
    document.getElementById(STYLE_ID)?.remove();
  },
};
