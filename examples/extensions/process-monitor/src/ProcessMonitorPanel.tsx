import { useEffect, useRef, useState } from "react";
import type { ExtensionContext, ProcessInfo } from "@silo-code/sdk";
import { useServiceState } from "@silo-code/sdk";

interface Props {
  ctx: ExtensionContext;
}

export function ProcessMonitorPanel({ ctx }: Props) {
  const procs = useServiceState(ctx.processes);

  // Track whether stats polling is active and hold its disposable.
  const [statsEnabled, setStatsEnabled] = useState(false);
  const statsDisposable = useRef<{ dispose(): void } | null>(null);

  // Clean up the stats disposable if the panel unmounts while stats are on.
  useEffect(
    () => () => {
      statsDisposable.current?.dispose();
    },
    [],
  );

  function toggleStats() {
    if (statsEnabled) {
      statsDisposable.current?.dispose();
      statsDisposable.current = null;
      setStatsEnabled(false);
    } else {
      statsDisposable.current = ctx.processes.enableStats();
      setStatsEnabled(true);
    }
  }

  const running = procs.filter((p) => !p.atPrompt);

  if (running.length === 0) {
    return (
      <div className="pm-empty">
        <p>No running processes.</p>
        <p>Processes will appear here when a terminal is active.</p>
      </div>
    );
  }

  return (
    <div className="pm-panel">
      <div className="pm-toolbar">
        <button
          className={`pm-stats-toggle ${statsEnabled ? "pm-stats-toggle--on" : ""}`}
          onClick={toggleStats}
          title={
            statsEnabled
              ? "Disable CPU/memory polling"
              : "Enable CPU/memory polling"
          }
        >
          <StatsIcon />
          {statsEnabled ? "Stats on" : "Stats off"}
        </button>
      </div>

      <div className="pm-list">
        {running.map((proc) => (
          <ProcessRow
            key={proc.sessionId}
            proc={proc}
            statsEnabled={statsEnabled}
            onFocus={() => {
              if (proc.terminalId) ctx.terminals.focus(proc.terminalId);
            }}
            onKill={() => ctx.processes.kill(proc.pgid)}
          />
        ))}
      </div>
    </div>
  );
}

interface RowProps {
  proc: ProcessInfo;
  statsEnabled: boolean;
  onFocus: () => void;
  onKill: () => void;
}

function ProcessRow({ proc, statsEnabled, onFocus, onKill }: RowProps) {
  const [killing, setKilling] = useState(false);

  async function handleKill() {
    setKilling(true);
    try {
      await onKill();
    } finally {
      // The process will flip atPrompt once the shell regains control;
      // reset the button state either way after a short grace period.
      setTimeout(() => setKilling(false), 4000);
    }
  }

  const displayName = proc.terminalTitle ?? proc.sessionId.slice(0, 8);
  const cwdShort = shortenPath(proc.cwd);

  return (
    <div
      className={`pm-row ${proc.atPrompt ? "pm-row--idle" : "pm-row--busy"}`}
    >
      {/* Status dot */}
      <span
        className={`pm-dot ${proc.atPrompt ? "pm-dot--idle" : "pm-dot--busy"}`}
        title={proc.atPrompt ? "Idle (at prompt)" : "Running"}
        aria-label={proc.atPrompt ? "idle" : "running"}
      />

      {/* Main info — click to focus */}
      <button className="pm-info" onClick={onFocus} title="Focus terminal">
        <span className="pm-name">
          {displayName}
          {!proc.atPrompt && proc.leader && (
            <span className="pm-process"> · {proc.leader}</span>
          )}
        </span>
        {cwdShort && <span className="pm-detail">{cwdShort}</span>}
        {statsEnabled && proc.stats && (
          <span className="pm-stats">
            <span
              className={`pm-cpu ${proc.stats.cpuPercent > 80 ? "pm-cpu--hot" : ""}`}
            >
              {proc.stats.cpuPercent.toFixed(1)}% CPU
            </span>
            <span className="pm-mem">{formatMem(proc.stats.memoryMb)}</span>
          </span>
        )}
        {statsEnabled && !proc.stats && proc.pgid > 0 && (
          <span className="pm-stats pm-stats--loading">collecting…</span>
        )}
      </button>

      {/* Kill button — only when a foreground process is running */}
      {!proc.atPrompt && (
        <button
          className="pm-kill"
          onClick={handleKill}
          disabled={killing}
          title={killing ? "Sending SIGTERM…" : `Kill ${proc.leader} (SIGTERM)`}
          aria-label={`Kill ${proc.leader}`}
        >
          {killing ? <SpinIcon /> : <KillIcon />}
        </button>
      )}
    </div>
  );
}

// ---- helpers ----------------------------------------------------------------

function shortenPath(cwd: string): string {
  if (!cwd) return "";
  const home = "~";
  const homePath = cwd
    .replace(/^\/Users\/[^/]+/, home)
    .replace(/^\/home\/[^/]+/, home);
  // Truncate very long paths from the left: keep last 3 segments.
  const parts = homePath.split("/").filter(Boolean);
  if (parts.length > 3) {
    return "…/" + parts.slice(-3).join("/");
  }
  return homePath;
}

function formatMem(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(0)} MB`;
}

// ---- icons ------------------------------------------------------------------

function StatsIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="1" y="6" width="2" height="5" />
      <rect x="5" y="3" width="2" height="8" />
      <rect x="9" y="1" width="2" height="10" />
    </svg>
  );
}

function KillIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2 2l6 6M8 2l-6 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SpinIcon() {
  return <span className="pm-spin" aria-hidden="true" />;
}
