import { Tooltip } from "@silo-code/sdk";
import { formatBytes } from "../../metrics";
import type { LiveData } from "../../store";

const SIZE = 16;
const CX = SIZE / 2;
const R = SIZE / 2 - 0.5;

const FILL = "var(--silo-color-text)";
const EMPTY = "color-mix(in srgb, var(--silo-color-text-lo) 30%, transparent)";

function PieIcon({ pct }: { pct: number }) {
  if (pct >= 99.5) {
    return (
      <svg width={SIZE} height={SIZE} aria-hidden>
        <circle cx={CX} cy={CX} r={R} fill={FILL} />
      </svg>
    );
  }
  if (pct <= 0.5) {
    return (
      <svg width={SIZE} height={SIZE} aria-hidden>
        <circle cx={CX} cy={CX} r={R} fill={EMPTY} />
      </svg>
    );
  }
  const angle = (pct / 100) * 2 * Math.PI - Math.PI / 2;
  const x = CX + R * Math.cos(angle);
  const y = CX + R * Math.sin(angle);
  const large = pct > 50 ? 1 : 0;
  const d = `M ${CX} ${CX} L ${CX} ${CX - R} A ${R} ${R} 0 ${large} 1 ${x} ${y} Z`;

  return (
    <svg width={SIZE} height={SIZE} aria-hidden>
      <circle cx={CX} cy={CX} r={R} fill={EMPTY} />
      <path d={d} fill={FILL} />
    </svg>
  );
}

export function MemPieStatus({ live }: { live: LiveData }) {
  const data = live.memory;
  const pct = data ? (data.usedBytes / data.totalBytes) * 100 : 0;
  const tip = data
    ? `Memory  ${Math.round(pct)}%  ·  App ${formatBytes(data.activeBytes)}  ·  Wired ${formatBytes(data.wiredBytes)}  ·  Cache ${formatBytes(data.compBytes)}  ·  Free ${formatBytes(data.freeBytes)}`
    : "Waiting for data…";

  return (
    <Tooltip content={tip}>
      <div
        className="sm-status-item"
        aria-label={data ? `Memory ${Math.round(pct)}%` : "Memory —"}
        role="img"
      >
        <PieIcon pct={pct} />
      </div>
    </Tooltip>
  );
}
