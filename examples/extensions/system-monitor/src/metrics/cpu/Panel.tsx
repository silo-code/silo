import { useRef } from "react";
import { useSize } from "../../hooks";
import type { LiveData } from "../../store";

const CPU_USER = "#4493f8";
const CPU_SYS = "#f47067";
const GRID_CLR = "var(--silo-color-border)";

const BAR_W = 3;
const GAP = 1;
const STEP = BAR_W + GAP;

function ghostBarH(i: number, maxH: number): number {
  const t = i * 0.45;
  const wave =
    Math.sin(t) * 0.22 +
    Math.sin(t * 1.8 + 1.2) * 0.12 +
    Math.sin(t * 0.27 + 0.5) * 0.3 +
    0.38;
  return Math.max(2, Math.round(Math.max(0, wave) * maxH * 0.65));
}

function CpuBarChart({
  data,
  w,
  h,
}: {
  data: { user: number; sys: number }[];
  w: number;
  h: number;
}) {
  if (w === 0 || h === 0) return null;
  const capacity = Math.max(Math.floor(w / STEP), 2);
  const svgW = capacity * STEP;
  const visReal = data.slice(-capacity);
  const ghostCount = capacity - visReal.length;

  return (
    <div style={{ width: svgW, height: h, overflow: "hidden" }}>
      <svg width={svgW} height={h} style={{ display: "block" }} aria-hidden>
        {[25, 50, 75].map((pct) => (
          <line
            key={pct}
            x1={0}
            y1={h * (1 - pct / 100)}
            x2={svgW}
            y2={h * (1 - pct / 100)}
            stroke={GRID_CLR}
            strokeWidth={0.5}
          />
        ))}
        {Array.from({ length: ghostCount }, (_, i) => {
          const gh = ghostBarH(i, h);
          return (
            <rect
              key={`g${i}`}
              x={i * STEP}
              y={h - gh}
              width={BAR_W}
              height={gh}
              fill="var(--silo-color-text-lo)"
              fillOpacity={0.18}
            />
          );
        })}
        {visReal.map((s, i) => {
          const userH = Math.round((s.user / 100) * h);
          const sysH = Math.round((s.sys / 100) * h);
          const x = (ghostCount + i) * STEP;
          const isNew = data.length > 0 && i === visReal.length - 1;
          return (
            <g
              key={isNew ? `new-${data.length}` : i}
              className={isNew ? "sm-bar-new" : undefined}
            >
              {userH > 0 && (
                <rect
                  x={x}
                  y={h - userH}
                  width={BAR_W}
                  height={userH}
                  fill={CPU_USER}
                  fillOpacity={0.88}
                />
              )}
              {sysH > 0 && (
                <rect
                  x={x}
                  y={h - userH - sysH}
                  width={BAR_W}
                  height={sysH}
                  fill={CPU_SYS}
                  fillOpacity={0.88}
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function CpuPanel({ live }: { live: LiveData }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const { w: chartW, h: chartH } = useSize(chartRef);
  const data = live.cpu;
  const total = data ? Math.round(data.userPct + data.sysPct) : null;

  return (
    <div className="sm-card sm-card-cpu">
      <div className="sm-header">
        <span className="sm-title">CPU</span>
        <span className="sm-headline">{total != null ? `${total}%` : "—"}</span>
      </div>
      <div className="sm-chart-wrap" ref={chartRef}>
        {!data || data.history.length === 0 ? (
          <div className="sm-waiting">waiting…</div>
        ) : (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "flex-end",
            }}
          >
            <CpuBarChart data={data.history} w={chartW} h={chartH} />
          </div>
        )}
      </div>
      <div className="sm-cpu-footer">
        <div className="sm-cpu-leg">
          <div className="sm-dot" style={{ background: CPU_USER }} />
          User{" "}
          <span className="sm-cpu-pct">
            {data ? `${Math.round(data.userPct)}%` : "—"}
          </span>
        </div>
        <div className="sm-cpu-leg">
          <div className="sm-dot" style={{ background: CPU_SYS }} />
          System{" "}
          <span className="sm-cpu-pct">
            {data ? `${Math.round(data.sysPct)}%` : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}
