import { Tooltip } from "@silo-code/sdk";
import { formatBytes } from "../../metrics";
import type { LiveData } from "../../store";

export function MemStatus({ live }: { live: LiveData }) {
  const data = live.memory;
  const pct = data
    ? Math.round((data.usedBytes / data.totalBytes) * 100)
    : null;
  const tip = data
    ? `App ${formatBytes(data.activeBytes)}  ·  Wired ${formatBytes(data.wiredBytes)}  ·  Cache ${formatBytes(data.compBytes)}  ·  Free ${formatBytes(data.freeBytes)}`
    : "Waiting for data…";
  return (
    <Tooltip content={tip}>
      <div className="sm-status-item">
        MEM{" "}
        <span className="sm-status-val">{pct != null ? `${pct}%` : "—"}</span>
      </div>
    </Tooltip>
  );
}
