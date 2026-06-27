import { Tooltip } from "@silo-code/sdk";
import type { LiveData } from "../../store";

export function CpuBarStatus({ live }: { live: LiveData }) {
  const data = live.cpu;
  const total = data
    ? Math.min(100, Math.round(data.userPct + data.sysPct))
    : 0;
  const tip = data
    ? `CPU  ${total}%  ·  User ${Math.round(data.userPct)}%  ·  System ${Math.round(data.sysPct)}%`
    : "Waiting for data…";

  return (
    <Tooltip content={tip}>
      <div className="sm-status-item">
        <div
          className="sm-sb-bar-track"
          aria-label={`CPU ${total}%`}
          role="img"
        >
          <div className="sm-sb-bar-fill" style={{ width: `${total}%` }} />
        </div>
      </div>
    </Tooltip>
  );
}
