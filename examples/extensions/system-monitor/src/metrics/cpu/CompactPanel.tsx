import type { LiveData } from "../../store";

const CPU_USER = "#4493f8";
const CPU_SYS = "#f47067";

export function CpuCompactPanel({ live }: { live: LiveData }) {
  const data = live.cpu;
  const userPct = data ? Math.round(data.userPct) : 0;
  const sysPct = data ? Math.round(data.sysPct) : 0;
  const idlePct = Math.max(0, 100 - userPct - sysPct);
  const total = data ? userPct + sysPct : null;

  return (
    <div className="sm-card sm-card-compact">
      <div className="sm-header">
        <span className="sm-title">CPU</span>
        <span className="sm-headline">{total != null ? `${total}%` : "—"}</span>
      </div>
      {!data ? (
        <div className="sm-compact-bar sm-compact-bar-empty" />
      ) : (
        <div
          className="sm-compact-bar"
          role="img"
          aria-label={`CPU: ${userPct}% user, ${sysPct}% system`}
        >
          {userPct > 0 && (
            <div
              className="sm-compact-seg"
              style={{ width: `${userPct}%`, background: CPU_USER }}
            />
          )}
          {sysPct > 0 && (
            <div
              className="sm-compact-seg"
              style={{ width: `${sysPct}%`, background: CPU_SYS }}
            />
          )}
          {idlePct > 0 && (
            <div
              className="sm-compact-seg sm-compact-seg-idle"
              style={{ width: `${idlePct}%` }}
            />
          )}
        </div>
      )}
    </div>
  );
}
