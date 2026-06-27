import { Tooltip } from "@silo-code/sdk";
import type { LiveData } from "../../store";

export function CpuStatus({ live }: { live: LiveData }) {
  const data = live.cpu;
  const total = data ? Math.round(data.userPct + data.sysPct) : null;
  const tip = data
    ? `User ${Math.round(data.userPct)}%  ·  System ${Math.round(data.sysPct)}%`
    : "Waiting for data…";
  return (
    <Tooltip content={tip}>
      <div className="sm-status-item">
        CPU{" "}
        <span className="sm-status-val">
          {total != null ? `${total}%` : "—"}
        </span>
      </div>
    </Tooltip>
  );
}
