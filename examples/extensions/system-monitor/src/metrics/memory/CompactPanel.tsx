import type { LiveData } from "../../store";

const MEM_SEGS = [
  { field: "activeBytes" as const, color: "#e3b341", label: "App" },
  { field: "wiredBytes" as const, color: "#f47067", label: "Wired" },
  { field: "compBytes" as const, color: "#8b5cf6", label: "Cache" },
  // Free is omitted — the bar background shows through, matching the CPU idle treatment.
];

export function MemCompactPanel({ live }: { live: LiveData }) {
  const data = live.memory;
  const usedGiB = data ? (data.usedBytes / 1024 ** 3).toFixed(1) : "--";
  const totalGiB = data ? (data.totalBytes / 1024 ** 3).toFixed(1) : "--";

  return (
    <div className="sm-card sm-card-compact">
      <div className="sm-header">
        <span className="sm-title">Memory</span>
        <span className="sm-headline">
          {usedGiB} / {totalGiB} GB
        </span>
      </div>
      {!data ? (
        <div className="sm-compact-bar sm-compact-bar-empty" />
      ) : (
        <div
          className="sm-compact-bar"
          role="img"
          aria-label={`Memory: ${usedGiB} GB used of ${totalGiB} GB`}
        >
          {MEM_SEGS.map(({ field, color, label }) => {
            const pct = (data[field] / data.totalBytes) * 100;
            if (pct < 0.5) return null;
            return (
              <div
                key={field}
                className="sm-compact-seg"
                style={{ width: `${pct}%`, background: color }}
                title={`${label}: ${pct.toFixed(1)}%`}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
