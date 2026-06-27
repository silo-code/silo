import type React from "react";
import type { PanelId, LiveData } from "./store";
import { CpuPanel } from "./metrics/cpu/Panel";
import { CpuCompactPanel } from "./metrics/cpu/CompactPanel";
import { CpuStatus } from "./metrics/cpu/Status";
import { CpuBarStatus } from "./metrics/cpu/BarStatus";
import { MemPanel } from "./metrics/memory/Panel";
import { MemCompactPanel } from "./metrics/memory/CompactPanel";
import { MemStatus } from "./metrics/memory/Status";
import { MemPieStatus } from "./metrics/memory/PieStatus";

export interface MetricDescriptor {
  id: PanelId;
  label: string;
  panelHint: string;
  sbHint: string;
  /** Absent for status-bar-only entries — these won't appear in the Side Panels list. */
  PanelComponent?: React.ComponentType<{ live: LiveData }>;
  StatusComponent: React.ComponentType<{ live: LiveData }>;
}

// To add a new metric (e.g. "disk"):
//   1. Add "disk" to PanelId in store.ts
//   2. Add it to DEFAULT_SETTINGS in store.ts
//   3. Create src/metrics/disk/Panel.tsx and Status.tsx
//   4. Handle "disk" fetch in poll.ts
//   5. Add an entry here — everything else picks it up automatically.
export const METRIC_REGISTRY: MetricDescriptor[] = [
  {
    id: "cpu",
    label: "CPU",
    panelHint: "Live bar chart of user and system CPU usage.",
    sbHint: "Show CPU percentage in the status bar.",
    PanelComponent: CpuPanel,
    StatusComponent: CpuStatus,
  },
  {
    id: "memory",
    label: "Memory",
    panelHint: "Donut chart with app, wired, cache, and free segments.",
    sbHint: "Show memory percentage in the status bar.",
    PanelComponent: MemPanel,
    StatusComponent: MemStatus,
  },
  {
    id: "cpu-compact",
    label: "CPU Bar",
    panelHint: "Compact single-bar view of user and system CPU usage.",
    sbHint: "Show CPU percentage in the status bar.",
    PanelComponent: CpuCompactPanel,
    StatusComponent: CpuStatus,
  },
  {
    id: "memory-compact",
    label: "Memory Bar",
    panelHint: "Compact single-bar view of app, wired, cache, and free memory.",
    sbHint: "Show memory percentage in the status bar.",
    PanelComponent: MemCompactPanel,
    StatusComponent: MemStatus,
  },
  {
    id: "cpu-bar",
    label: "CPU Bar",
    panelHint: "",
    sbHint: "Show a mini bar chart of CPU usage in the status bar.",
    StatusComponent: CpuBarStatus,
  },
  {
    id: "memory-pie",
    label: "Memory Pie",
    panelHint: "",
    sbHint: "Show a mini pie chart of memory usage in the status bar.",
    StatusComponent: MemPieStatus,
  },
];

export function getDescriptor(id: PanelId): MetricDescriptor | undefined {
  const descriptor = METRIC_REGISTRY.find((m) => m.id === id);
  if (!descriptor)
    console.error(
      `[system-monitor] Unknown metric id: "${id}". Add an entry to METRIC_REGISTRY.`,
    );
  return descriptor;
}
