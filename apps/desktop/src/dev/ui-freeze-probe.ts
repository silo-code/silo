import {
  createHostChannel,
  getOutputLogs,
  commandRegistry,
} from "@silo-code/extension-host";
import {
  BACKGROUND_GAP_MS,
  CORRELATE_LOOKBACK_MS,
  DEFAULT_FREEZE_THRESHOLD_MS,
  DEFAULT_WARMUP_MS,
  correlateAroundFreeze,
  formatFreezeLog,
  probeEnabledFromStorage,
  summarizeCorrelation,
  tickFreezeProbe,
  type CorrelateEntry,
} from "./ui-freeze-probe-model";
import "./ui-freeze-probe.css";

/** Persisted enable flag — Prod defaults off; Dev defaults on. */
export const UI_FREEZE_PROBE_STORAGE_KEY = "silo.uiFreezeProbe";

const channel = createHostChannel("silo:ui-freeze", "UI Freeze");

export interface UiFreezeProbeOptions {
  /** Gap (ms) that counts as a stall. Default 100. */
  thresholdMs?: number;
  /** Ignore stalls until this many ms after start. Default 2000. */
  warmupMs?: number;
}

/** Dev: on unless explicitly `"0"`. Prod/release: on only when `"1"`. */
export function isUiFreezeProbeEnabled(): boolean {
  return probeEnabledFromStorage(
    localStorage.getItem(UI_FREEZE_PROBE_STORAGE_KEY),
    import.meta.env.DEV,
  );
}

export function setUiFreezeProbeEnabled(on: boolean): void {
  localStorage.setItem(UI_FREEZE_PROBE_STORAGE_KEY, on ? "1" : "0");
}

/** Snapshot every Output channel (best-effort) for freeze correlation. */
function collectAllOutputEntries(): CorrelateEntry[] {
  const discovery = getOutputLogs({ channel: "silo:ui-freeze", limit: 1 });
  const out: CorrelateEntry[] = [];
  for (const { key } of discovery.channels) {
    if (key === "silo:ui-freeze") continue;
    const res = getOutputLogs({ channel: key, limit: 80 });
    for (const e of res.entries) {
      const timestampMs = Date.parse(e.timestamp);
      if (Number.isNaN(timestampMs)) continue;
      out.push({ timestampMs, channel: key, message: e.message });
    }
  }
  return out;
}

/**
 * rAF freeze probe: paints a sweeper and logs stalls to Output → "UI Freeze"
 * with a correlation summary of nearby Output activity.
 *
 * Returns a disposer.
 */
export function startUiFreezeProbe(
  options: UiFreezeProbeOptions = {},
): () => void {
  const thresholdMs = options.thresholdMs ?? DEFAULT_FREEZE_THRESHOLD_MS;
  const warmupMs = options.warmupMs ?? DEFAULT_WARMUP_MS;

  const root = document.createElement("div");
  root.className = "ui-freeze-probe";
  root.setAttribute("aria-hidden", "true");
  root.title =
    "UI freeze probe — rAF sweeper. Stalls ≥ threshold log to Output → UI Freeze.";

  const dial = document.createElement("div");
  dial.className = "ui-freeze-probe__dial";
  const hand = document.createElement("div");
  hand.className = "ui-freeze-probe__hand";
  dial.appendChild(hand);

  const label = document.createElement("div");
  label.className = "ui-freeze-probe__label";
  label.textContent = "rAF";

  root.append(dial, label);
  document.body.appendChild(root);

  const startedAtMs = performance.now();
  let prevFrameMs: number | null = null;
  let rafId = 0;
  let lastLoggedGap = 0;
  let angle = 0;

  const paint = (nowMs: number) => {
    const hidden = document.visibilityState === "hidden";
    const result = tickFreezeProbe({
      prevFrameMs,
      nowMs,
      startedAtMs,
      hidden,
      thresholdMs,
      warmupMs,
    });
    prevFrameMs = result.nextPrev;

    if (result.kind === "freeze") {
      const wall = new Date();
      const freezeEndMs = wall.getTime();
      const gapMs = result.gapMs;
      const likelyBackground = gapMs >= BACKGROUND_GAP_MS;

      let nearby: CorrelateEntry[] = [];
      try {
        nearby = correlateAroundFreeze(
          collectAllOutputEntries(),
          freezeEndMs,
          gapMs,
          CORRELATE_LOOKBACK_MS,
        );
      } catch {
        /* Output store not ready — still log the freeze */
      }

      const summary = summarizeCorrelation(nearby);
      const base = formatFreezeLog(gapMs, wall);
      const msg = likelyBackground
        ? `${base} — likely background/throttle; ${summary}`
        : `${base} — ${summary}`;

      const sample = nearby.slice(-12).map((e) => ({
        channel: e.channel,
        message: e.message.slice(0, 160),
        t: new Date(e.timestampMs).toISOString(),
      }));

      channel.warn(msg, {
        gapMs: Math.round(gapMs),
        thresholdMs,
        atMs: freezeEndMs,
        onsetMs: freezeEndMs - Math.round(gapMs),
        likelyBackground,
        nearbyCount: nearby.length,
        nearbySample: sample,
      });

      lastLoggedGap = gapMs;
      root.classList.add("ui-freeze-probe--hit");
      label.textContent = `${Math.round(gapMs)}ms`;
      window.setTimeout(() => {
        root.classList.remove("ui-freeze-probe--hit");
      }, 1200);
    } else if (result.kind === "ok" && result.gapMs > 0) {
      if (lastLoggedGap === 0) {
        label.textContent = "rAF";
      }
    }

    if (!hidden) {
      angle = (angle + 6) % 360;
      hand.style.transform = `rotate(${angle}deg)`;
    }

    rafId = requestAnimationFrame(paint);
  };

  rafId = requestAnimationFrame(paint);
  channel.info(
    `UI freeze probe armed (threshold ${thresholdMs}ms, warmup ${warmupMs}ms)`,
  );

  return () => {
    cancelAnimationFrame(rafId);
    root.remove();
  };
}

let stopProbe: (() => void) | null = null;

function syncProbeToFlag(): boolean {
  const want = isUiFreezeProbeEnabled();
  if (want && !stopProbe) {
    stopProbe = startUiFreezeProbe();
  } else if (!want && stopProbe) {
    stopProbe();
    stopProbe = null;
    channel.info("UI freeze probe stopped");
  }
  return want;
}

/**
 * Wire the probe for any build: Dev auto-starts; Prod starts only when the
 * Help → "UI Freeze Probe" toggle (or localStorage) has enabled it.
 */
export function initUiFreezeProbe(): void {
  try {
    commandRegistry.register({
      id: "core.toggleUiFreezeProbe",
      label: "Toggle UI Freeze Probe",
      run: () => {
        const next = !isUiFreezeProbeEnabled();
        setUiFreezeProbeEnabled(next);
        const on = syncProbeToFlag();
        channel.info(
          on
            ? "UI freeze probe enabled (Output → UI Freeze)"
            : "UI freeze probe disabled",
        );
      },
    });
  } catch (err) {
    // Duplicate register on HMR — ignore.
    if (!(err instanceof Error && /duplicate id/.test(err.message))) {
      console.error("ui freeze probe command register failed", err);
    }
  }

  syncProbeToFlag();
}
