import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { SidePanelProps } from "@silo-code/sdk";
import { formatBytes } from "./metrics";
import type { CpuSample, Snapshot } from "./metrics";
import type { PanelEntry, Settings } from "./store";
import { sysmonStore } from "./store";

// ─── Chart accent colors (intentionally dark, not theme-sensitive) ────────────

const CPU_USER = "#4493f8";
const CPU_SYS = "#f47067";
const MEM_APP = "#e3b341";
const MEM_WIRED = "#f47067";
const MEM_CACHE = "#4493f8";
const MEM_FREE = "#3fb950";
const GRID_CLR = "var(--silo-color-border)";

// ─── Hooks ───────────────────────────────────────────────────────────────────

function useStore() {
  const [, tick] = useState(0);
  useEffect(() => sysmonStore.subscribe(() => tick((n) => n + 1)), []);
  return sysmonStore;
}

function useSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return size;
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function GearIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
    >
      <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.892 3.433-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.892-1.64-.901-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.475l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z" />
      <path d="M8 5.754a2.246 2.246 0 1 0 0 4.492 2.246 2.246 0 0 0 0-4.492zM4.754 8a3.246 3.246 0 1 1 6.492 0 3.246 3.246 0 0 1-6.492 0z" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8z"
      />
    </svg>
  );
}

// ─── DonutRing ───────────────────────────────────────────────────────────────

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

// ─── CpuBarChart ─────────────────────────────────────────────────────────────

const BAR_W = 3;
const GAP = 1;
const STEP = BAR_W + GAP;

// Ghost bar heights: two fast waves for organic texture + one slow modulator
// that periodically brings peaks much lower, creating natural flat stretches.
function ghostBarH(i: number, maxH: number): number {
  const t = i * 0.45;
  const wave =
    Math.sin(t) * 0.22 +
    Math.sin(t * 1.8 + 1.2) * 0.12 +
    Math.sin(t * 0.27 + 0.5) * 0.3 + // slow modulator — flattens some peaks
    0.38;
  return Math.max(2, Math.round(Math.max(0, wave) * maxH * 0.65));
}

function CpuBarChart({
  data,
  w,
  h,
}: {
  data: CpuSample[];
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

// ─── CpuMiniPanel ─────────────────────────────────────────────────────────────

function CpuMiniPanel({
  snapshot,
  cpuHistory,
}: {
  snapshot: Snapshot | null;
  cpuHistory: CpuSample[];
}) {
  const chartRef = useRef<HTMLDivElement>(null);
  const { w: chartW, h: chartH } = useSize(chartRef);
  const cpuTotal = snapshot
    ? Math.round(snapshot.cpuUserPct + snapshot.cpuSysPct)
    : null;

  return (
    <div className="sm-card sm-mini-cpu">
      <div className="sm-header">
        <span className="sm-title">CPU</span>
        <span className="sm-headline">
          {cpuTotal != null ? `${cpuTotal}%` : "—"}
        </span>
      </div>
      <div className="sm-chart-wrap" ref={chartRef}>
        {cpuHistory.length === 0 ? (
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
            <CpuBarChart data={cpuHistory} w={chartW} h={chartH} />
          </div>
        )}
      </div>
      <div className="sm-cpu-footer">
        <div className="sm-cpu-leg">
          <div className="sm-dot" style={{ background: CPU_USER }} />
          User{" "}
          <span className="sm-cpu-pct">
            {snapshot ? `${Math.round(snapshot.cpuUserPct)}%` : "—"}
          </span>
        </div>
        <div className="sm-cpu-leg">
          <div className="sm-dot" style={{ background: CPU_SYS }} />
          System{" "}
          <span className="sm-cpu-pct">
            {snapshot ? `${Math.round(snapshot.cpuSysPct)}%` : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── MemMiniPanel ─────────────────────────────────────────────────────────────

function MemMiniPanel({ snapshot }: { snapshot: Snapshot | null }) {
  const appUsed = snapshot?.memActiveBytes ?? 0;
  const memSegments: DonutSegment[] = snapshot
    ? [
        { pct: (appUsed / snapshot.memTotalBytes) * 100, color: MEM_APP },
        {
          pct: (snapshot.memWiredBytes / snapshot.memTotalBytes) * 100,
          color: MEM_WIRED,
        },
        {
          pct: (snapshot.memCompBytes / snapshot.memTotalBytes) * 100,
          color: MEM_CACHE,
        },
        {
          pct: (snapshot.memFreeBytes / snapshot.memTotalBytes) * 100,
          color: MEM_FREE,
        },
      ]
    : [];
  const usedGiB = snapshot
    ? (snapshot.memUsedBytes / 1024 ** 3).toFixed(1)
    : "--";
  const totalGiB = snapshot
    ? (snapshot.memTotalBytes / 1024 ** 3).toFixed(1)
    : "--";
  const memLegend = [
    {
      label: "App",
      val: snapshot ? formatBytes(appUsed) : "—",
      color: MEM_APP,
    },
    {
      label: "Wired",
      val: snapshot ? formatBytes(snapshot.memWiredBytes) : "—",
      color: MEM_WIRED,
    },
    {
      label: "Cache",
      val: snapshot ? formatBytes(snapshot.memCompBytes) : "—",
      color: MEM_CACHE,
    },
    {
      label: "Free",
      val: snapshot ? formatBytes(snapshot.memFreeBytes) : "—",
      color: MEM_FREE,
    },
  ];

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
          segments={memSegments}
          center={
            snapshot && (
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
                  {Math.round(snapshot.memUsedBytes / 1024 ** 3)}
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
          {memLegend.map(({ label, val, color }) => (
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

// ─── SettingsView ─────────────────────────────────────────────────────────────

export function SettingsView({ onClose }: { onClose?: () => void }) {
  const store = useStore();
  const { settings } = store;

  function movePanel(id: PanelEntry["id"], dir: -1 | 1) {
    const panels = [...settings.panels];
    const i = panels.findIndex((p) => p.id === id);
    const j = i + dir;
    if (j < 0 || j >= panels.length) return;
    [panels[i], panels[j]] = [panels[j], panels[i]];
    sysmonStore.updateSettings({ ...settings, panels });
  }

  function togglePanel(id: PanelEntry["id"]) {
    sysmonStore.updateSettings({
      ...settings,
      panels: settings.panels.map((p) =>
        p.id === id ? { ...p, enabled: !p.enabled } : p,
      ),
    });
  }

  function moveSb(id: PanelEntry["id"], dir: -1 | 1) {
    const statusBar = [...settings.statusBar];
    const i = statusBar.findIndex((p) => p.id === id);
    const j = i + dir;
    if (j < 0 || j >= statusBar.length) return;
    [statusBar[i], statusBar[j]] = [statusBar[j], statusBar[i]];
    sysmonStore.updateSettings({ ...settings, statusBar });
  }

  function toggleSb(id: PanelEntry["id"]) {
    sysmonStore.updateSettings({
      ...settings,
      statusBar: settings.statusBar.map((p) =>
        p.id === id ? { ...p, enabled: !p.enabled } : p,
      ),
    });
  }

  const LABEL: Record<PanelEntry["id"], string> = {
    cpu: "CPU",
    memory: "Memory",
  };

  function ReorderSection({
    label,
    items,
    onToggle,
    onMove,
  }: {
    label: string;
    items: PanelEntry[];
    onToggle: (id: PanelEntry["id"]) => void;
    onMove: (id: PanelEntry["id"], dir: -1 | 1) => void;
  }) {
    return (
      <div className="sm-settings-section">
        <div className="sm-settings-label">{label}</div>
        {items.map((p, i) => (
          <div key={p.id} className="sm-settings-row">
            <label className="sm-settings-check">
              <input
                type="checkbox"
                checked={p.enabled}
                onChange={() => onToggle(p.id)}
              />
              <span>{LABEL[p.id]}</span>
            </label>
            <div className="sm-reorder-btns">
              <button
                disabled={i === 0}
                onClick={() => onMove(p.id, -1)}
                aria-label="Move up"
              >
                ▲
              </button>
              <button
                disabled={i === items.length - 1}
                onClick={() => onMove(p.id, 1)}
                aria-label="Move down"
              >
                ▼
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="sm-settings">
      {onClose && (
        <div className="sm-settings-header">
          <button className="sm-back-btn" onClick={onClose}>
            <BackIcon /> Back
          </button>
        </div>
      )}

      <ReorderSection
        label="Side Panels"
        items={settings.panels}
        onToggle={togglePanel}
        onMove={movePanel}
      />
      <ReorderSection
        label="Status Bar Items"
        items={settings.statusBar}
        onToggle={toggleSb}
        onMove={moveSb}
      />
    </div>
  );
}

// ─── SystemMonitorPanel ───────────────────────────────────────────────────────

export function SystemMonitorPanel({ storage, hydrated }: SidePanelProps) {
  const store = useStore();
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (hydrated) sysmonStore.hydrate(storage);
  }, [hydrated, storage]);

  const {
    settings,
    live: { snapshot, cpuHistory, error },
  } = store;

  if (error) {
    return (
      <div className="sysmon">
        <div className="sm-error">{error}</div>
      </div>
    );
  }

  const visiblePanels = settings.panels.filter((p) => p.enabled);

  return (
    <div className="sysmon">
      {!showSettings && (
        <button
          className="sm-gear-btn"
          onClick={() => setShowSettings(true)}
          title="Settings"
          aria-label="Settings"
        >
          <GearIcon />
        </button>
      )}

      {showSettings ? (
        <SettingsView onClose={() => setShowSettings(false)} />
      ) : (
        <div className="sm-panels">
          {visiblePanels.length === 0 ? (
            <div
              style={{
                padding: "20px 14px",
                color: "var(--silo-color-text-lo)",
                fontSize: 11,
              }}
            >
              All panels hidden. Open Settings to re-enable them.
            </div>
          ) : (
            visiblePanels.map((p) =>
              p.id === "cpu" ? (
                <CpuMiniPanel
                  key="cpu"
                  snapshot={snapshot}
                  cpuHistory={cpuHistory}
                />
              ) : (
                <MemMiniPanel key="memory" snapshot={snapshot} />
              ),
            )
          )}
        </div>
      )}
    </div>
  );
}
