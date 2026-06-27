import type React from "react";
import { formatBytes } from "../../metrics";
import type { LiveData, MemData } from "../../store";

const MEM_DEFS = [
  { label: "App", field: "activeBytes" as const, color: "#e3b341" },
  { label: "Wired", field: "wiredBytes" as const, color: "#f47067" },
  { label: "Cache", field: "compBytes" as const, color: "#4493f8" },
  { label: "Free", field: "freeBytes" as const, color: "#3fb950" },
] satisfies { label: string; field: keyof MemData; color: string }[];

interface DonutSegment {
  pct: number;
  color: string;
}

function DonutRing({
  segments,
  size,
  center,
}: {
  segments: DonutSegment[];
  size: number;
  center: React.ReactNode;
}) {
  const sw = Math.round(size / 8);
  const r = (size - sw) / 2;
  const cx = size / 2;
  const C = 2 * Math.PI * r;
  let cum = 0;

  return (
    <div
      style={{ position: "relative", width: size, height: size, flexShrink: 0 }}
    >
      <svg
        width={size}
        height={size}
        style={{ position: "absolute", inset: 0 }}
        aria-hidden
      >
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke="var(--silo-color-border)"
          strokeWidth={sw}
        />
        {segments.map((seg, i) => {
          if (seg.pct < 0.3) {
            cum += seg.pct;
            return null;
          }
          const dash = (seg.pct / 100) * C;
          const gap = C - dash;
          const angle = (cum / 100) * 360 - 90;
          cum += seg.pct;
          return (
            <circle
              key={i}
              cx={cx}
              cy={cx}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={sw}
              strokeDasharray={`${dash} ${gap}`}
              transform={`rotate(${angle}, ${cx}, ${cx})`}
            />
          );
        })}
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        {center}
      </div>
    </div>
  );
}

export function MemPanel({ live }: { live: LiveData }) {
  const data = live.memory;
  const usedGiB = data ? (data.usedBytes / 1024 ** 3).toFixed(1) : "--";
  const totalGiB = data ? (data.totalBytes / 1024 ** 3).toFixed(1) : "--";

  const segments = data
    ? MEM_DEFS.map((d) => ({
        pct: (data[d.field] / data.totalBytes) * 100,
        color: d.color,
      }))
    : [];

  const legend = MEM_DEFS.map((d) => ({
    label: d.label,
    val: data ? formatBytes(data[d.field]) : "—",
    color: d.color,
  }));

  return (
    <div className="sm-card">
      <div className="sm-header">
        <span className="sm-title">Memory</span>
        <span className="sm-headline">
          {usedGiB} / {totalGiB} GB
        </span>
      </div>
      <div className="sm-mem-body">
        <DonutRing
          size={78}
          segments={segments}
          center={
            data && (
              <>
                <span
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    lineHeight: 1,
                    color: "var(--silo-color-text)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {Math.round(data.usedBytes / 1024 ** 3)}
                </span>
                <span
                  style={{
                    fontSize: 9,
                    color: "var(--silo-color-text-lo)",
                    lineHeight: 1,
                    marginTop: 2,
                  }}
                >
                  GB
                </span>
              </>
            )
          }
        />
        <div className="sm-legend">
          {legend.map(({ label, val, color }) => (
            <div key={label} className="sm-legend-row">
              <div className="sm-dot" style={{ background: color }} />
              <span className="sm-leg-label">{label}</span>
              <span className="sm-leg-val">{val}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
