import { useEffect, useState } from "react";
import type { Snapshot } from "./metrics";
import { sysmonStore } from "./store";

function useStore() {
  const [, tick] = useState(0);
  useEffect(() => sysmonStore.subscribe(() => tick((n) => n + 1)), []);
  return sysmonStore;
}

function CpuChip({ snapshot }: { snapshot: Snapshot | null }) {
  const total = snapshot
    ? Math.round(snapshot.cpuUserPct + snapshot.cpuSysPct)
    : null;
  return (
    <div className="sm-status-item">
      CPU{" "}
      <span className="sm-status-val">{total != null ? `${total}%` : "—"}</span>
    </div>
  );
}

function MemChip({ snapshot }: { snapshot: Snapshot | null }) {
  const pct = snapshot
    ? Math.round((snapshot.memUsedBytes / snapshot.memTotalBytes) * 100)
    : null;
  return (
    <div className="sm-status-item">
      MEM <span className="sm-status-val">{pct != null ? `${pct}%` : "—"}</span>
    </div>
  );
}

// Single registered status item that renders chips in the configured order.
// display:contents makes the wrapper invisible to layout so each chip
// participates directly as a flex child of the status bar — spacing and
// alignment match native items exactly.
export function SystemMonitorStatusGroup() {
  const store = useStore();
  const enabled = store.settings.statusBar.filter((item) => item.enabled);
  if (enabled.length === 0) return null;
  const { snapshot } = store.live;
  return (
    <div style={{ display: "contents" }}>
      {enabled.map((item) =>
        item.id === "cpu" ? (
          <CpuChip key="cpu" snapshot={snapshot} />
        ) : (
          <MemChip key="memory" snapshot={snapshot} />
        ),
      )}
    </div>
  );
}
