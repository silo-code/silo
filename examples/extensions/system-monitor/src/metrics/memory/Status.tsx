import type { LiveData } from "../../store";

export function MemStatus({ live }: { live: LiveData }) {
  const data = live.memory;
  const pct = data
    ? Math.round((data.usedBytes / data.totalBytes) * 100)
    : null;
  return (
    <div className="sm-status-item">
      MEM <span className="sm-status-val">{pct != null ? `${pct}%` : "—"}</span>
    </div>
  );
}
