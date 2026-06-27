import type { LiveData } from "../../store";

export function CpuStatus({ live }: { live: LiveData }) {
  const data = live.cpu;
  const total = data ? Math.round(data.userPct + data.sysPct) : null;
  return (
    <div className="sm-status-item">
      CPU{" "}
      <span className="sm-status-val">{total != null ? `${total}%` : "—"}</span>
    </div>
  );
}
