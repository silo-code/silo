/**
 * A tiny self-contained Web Audio synth — no asset files, no dependencies.
 * Replaces the `cuelume` package, which cached one `AudioContext` for the
 * page's lifetime; in Silo's WKWebView shell that context can get stuck
 * reporting "running" while producing no output once the window backgrounds
 * (https://bugs.webkit.org/show_bug.cgi?id=231105), with no reliable way to
 * detect or recover from outside the library. Creating a fresh, short-lived
 * `AudioContext` per call and closing it when done sidesteps the bug by
 * construction — there's no long-lived context left around to go stale.
 *
 * The recipe data and rendering approach (layered tone/noise sources into a
 * shared soft delay/feedback "shimmer" send) are ported from cuelume
 * (MIT licensed, https://github.com/Danilaa1/cuelume) — that curated palette
 * is what actually sounds good; only the AudioContext lifecycle changed.
 */

export type SoundName =
  | "chime"
  | "sparkle"
  | "droplet"
  | "bloom"
  | "whisper"
  | "tick"
  | "press"
  | "release"
  | "toggle"
  | "success"
  | "error"
  | "page"
  | "loading"
  | "ready";

interface ToneLayer {
  kind: "tone";
  waveform: OscillatorType;
  frequency: number;
  offset?: number;
  attack: number;
  decay: number;
  peak: number;
  detune?: number;
  glideTo?: number;
  glideTime?: number;
}

interface NoiseLayer {
  kind: "noise";
  filterType: BiquadFilterType;
  filterFrequency: number;
  filterQ?: number;
  offset?: number;
  attack: number;
  decay: number;
  peak: number;
}

type Layer = ToneLayer | NoiseLayer;

interface Shimmer {
  delay: number;
  feedback: number;
  wet: number;
  lowpass: number;
}

interface Recipe {
  masterGain: number;
  layers: Layer[];
  shimmer?: Shimmer;
}

const RECIPES: Record<SoundName, Recipe> = {
  chime: {
    masterGain: 0.5,
    layers: [
      {
        kind: "tone",
        waveform: "sine",
        frequency: 1046.5,
        attack: 0.006,
        decay: 0.22,
        peak: 0.09,
      },
      {
        kind: "tone",
        waveform: "sine",
        frequency: 1568,
        offset: 0.09,
        attack: 0.006,
        decay: 0.26,
        peak: 0.08,
      },
    ],
    shimmer: { delay: 0.12, feedback: 0.25, wet: 0.18, lowpass: 4000 },
  },
  sparkle: {
    masterGain: 0.5,
    layers: [
      {
        kind: "tone",
        waveform: "sine",
        frequency: 1760,
        offset: 0,
        attack: 0.003,
        decay: 0.09,
        peak: 0.045,
      },
      {
        kind: "tone",
        waveform: "sine",
        frequency: 2217,
        offset: 0.045,
        attack: 0.003,
        decay: 0.09,
        peak: 0.04,
      },
      {
        kind: "tone",
        waveform: "sine",
        frequency: 2637,
        offset: 0.09,
        attack: 0.003,
        decay: 0.1,
        peak: 0.038,
      },
      {
        kind: "tone",
        waveform: "sine",
        frequency: 3520,
        offset: 0.135,
        attack: 0.003,
        decay: 0.12,
        peak: 0.032,
      },
    ],
    shimmer: { delay: 0.07, feedback: 0.35, wet: 0.22, lowpass: 6000 },
  },
  droplet: {
    masterGain: 0.55,
    layers: [
      {
        kind: "tone",
        waveform: "sine",
        frequency: 1200,
        glideTo: 550,
        glideTime: 0.14,
        attack: 0.004,
        decay: 0.2,
        peak: 0.075,
      },
    ],
    shimmer: { delay: 0.09, feedback: 0.2, wet: 0.15, lowpass: 3000 },
  },
  bloom: {
    masterGain: 0.5,
    layers: [
      {
        kind: "tone",
        waveform: "sine",
        frequency: 528,
        attack: 0.06,
        decay: 0.32,
        peak: 0.06,
      },
      {
        kind: "tone",
        waveform: "sine",
        frequency: 528,
        detune: 12,
        attack: 0.06,
        decay: 0.34,
        peak: 0.05,
      },
    ],
    shimmer: { delay: 0.15, feedback: 0.2, wet: 0.12, lowpass: 2500 },
  },
  whisper: {
    masterGain: 0.5,
    layers: [
      {
        kind: "noise",
        filterType: "lowpass",
        filterFrequency: 1200,
        filterQ: 0.7,
        attack: 0.04,
        decay: 0.16,
        peak: 0.05,
      },
    ],
  },
  tick: {
    masterGain: 0.4,
    layers: [
      {
        kind: "noise",
        filterType: "bandpass",
        filterFrequency: 5400,
        filterQ: 1.8,
        attack: 0.001,
        decay: 0.018,
        peak: 0.14,
      },
      {
        kind: "tone",
        waveform: "sine",
        frequency: 2600,
        attack: 0.001,
        decay: 0.012,
        peak: 0.018,
      },
    ],
  },
  press: {
    masterGain: 0.4,
    layers: [
      {
        kind: "noise",
        filterType: "bandpass",
        filterFrequency: 1700,
        filterQ: 1.4,
        attack: 0.001,
        decay: 0.02,
        peak: 0.13,
      },
    ],
  },
  release: {
    masterGain: 0.4,
    layers: [
      {
        kind: "noise",
        filterType: "bandpass",
        filterFrequency: 4600,
        filterQ: 1.8,
        attack: 0.001,
        decay: 0.016,
        peak: 0.12,
      },
      {
        kind: "tone",
        waveform: "sine",
        frequency: 3200,
        offset: 0.006,
        attack: 0.001,
        decay: 0.05,
        peak: 0.02,
      },
    ],
  },
  toggle: {
    masterGain: 0.4,
    layers: [
      {
        kind: "noise",
        filterType: "bandpass",
        filterFrequency: 2200,
        filterQ: 1.6,
        attack: 0.001,
        decay: 0.016,
        peak: 0.12,
      },
      {
        kind: "noise",
        filterType: "bandpass",
        filterFrequency: 3800,
        filterQ: 1.6,
        offset: 0.024,
        attack: 0.001,
        decay: 0.02,
        peak: 0.1,
      },
    ],
  },
  success: {
    masterGain: 0.5,
    layers: [
      {
        kind: "tone",
        waveform: "sine",
        frequency: 880,
        attack: 0.004,
        decay: 0.09,
        peak: 0.06,
      },
      {
        kind: "tone",
        waveform: "sine",
        frequency: 1108.73,
        offset: 0.06,
        attack: 0.004,
        decay: 0.1,
        peak: 0.06,
      },
      {
        kind: "tone",
        waveform: "sine",
        frequency: 1318.51,
        offset: 0.12,
        attack: 0.004,
        decay: 0.18,
        peak: 0.07,
      },
    ],
    shimmer: { delay: 0.1, feedback: 0.22, wet: 0.16, lowpass: 4500 },
  },
  error: {
    masterGain: 0.42,
    layers: [
      {
        kind: "noise",
        filterType: "bandpass",
        filterFrequency: 850,
        filterQ: 1.1,
        attack: 0.001,
        decay: 0.035,
        peak: 0.13,
      },
      {
        kind: "tone",
        waveform: "triangle",
        frequency: 440,
        offset: 0.025,
        attack: 0.004,
        decay: 0.09,
        peak: 0.045,
      },
      {
        kind: "tone",
        waveform: "triangle",
        frequency: 349.23,
        offset: 0.1,
        attack: 0.004,
        decay: 0.14,
        peak: 0.04,
      },
    ],
  },
  page: {
    masterGain: 0.38,
    layers: [
      {
        kind: "noise",
        filterType: "lowpass",
        filterFrequency: 1800,
        filterQ: 0.7,
        attack: 0.006,
        decay: 0.08,
        peak: 0.11,
      },
      {
        kind: "noise",
        filterType: "bandpass",
        filterFrequency: 4200,
        filterQ: 1.2,
        offset: 0.04,
        attack: 0.004,
        decay: 0.065,
        peak: 0.08,
      },
      {
        kind: "tone",
        waveform: "sine",
        frequency: 2400,
        offset: 0.075,
        attack: 0.002,
        decay: 0.045,
        peak: 0.02,
      },
    ],
  },
  loading: {
    masterGain: 0.42,
    layers: [
      {
        kind: "noise",
        filterType: "lowpass",
        filterFrequency: 1400,
        filterQ: 0.6,
        attack: 0.035,
        decay: 0.14,
        peak: 0.035,
      },
      {
        kind: "tone",
        waveform: "sine",
        frequency: 420,
        glideTo: 630,
        glideTime: 0.18,
        attack: 0.025,
        decay: 0.18,
        peak: 0.05,
      },
    ],
    shimmer: { delay: 0.11, feedback: 0.18, wet: 0.12, lowpass: 2800 },
  },
  ready: {
    masterGain: 0.45,
    layers: [
      {
        kind: "noise",
        filterType: "bandpass",
        filterFrequency: 3200,
        filterQ: 1.7,
        attack: 0.001,
        decay: 0.018,
        peak: 0.1,
      },
      {
        kind: "tone",
        waveform: "sine",
        frequency: 659.25,
        offset: 0.025,
        attack: 0.012,
        decay: 0.2,
        peak: 0.05,
      },
      {
        kind: "tone",
        waveform: "sine",
        frequency: 987.77,
        offset: 0.025,
        attack: 0.012,
        decay: 0.22,
        peak: 0.035,
      },
    ],
    shimmer: { delay: 0.13, feedback: 0.2, wet: 0.13, lowpass: 3600 },
  },
};

const SOURCE_STOP_PADDING = 0.05;
const CLEANUP_MARGIN = 0.05;
const INAUDIBLE_GAIN = 0.001;

export const sounds: readonly SoundName[] = Object.keys(RECIPES) as SoundName[];

export function isSoundName(value: unknown): value is SoundName {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(RECIPES, value)
  );
}

function renderTone(
  context: AudioContext,
  destination: AudioNode,
  layer: ToneLayer,
  startTime: number,
): void {
  const oscillator = context.createOscillator();
  oscillator.type = layer.waveform;
  oscillator.frequency.setValueAtTime(layer.frequency, startTime);
  if (layer.detune) oscillator.detune.value = layer.detune;
  if (layer.glideTo !== undefined) {
    const glideTime = layer.glideTime ?? layer.attack + layer.decay;
    oscillator.frequency.exponentialRampToValueAtTime(
      layer.glideTo,
      startTime + glideTime,
    );
  }
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(layer.peak, startTime + layer.attack);
  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    startTime + layer.attack + layer.decay,
  );
  oscillator.connect(gain).connect(destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + layer.attack + layer.decay + SOURCE_STOP_PADDING);
}

function renderNoise(
  context: AudioContext,
  destination: AudioNode,
  layer: NoiseLayer,
  startTime: number,
): void {
  const duration = layer.attack + layer.decay + SOURCE_STOP_PADDING;
  const length = Math.max(1, Math.floor(duration * context.sampleRate));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = 2 * Math.random() - 1;
  const source = context.createBufferSource();
  source.buffer = buffer;
  const filter = context.createBiquadFilter();
  filter.type = layer.filterType;
  filter.frequency.value = layer.filterFrequency;
  if (layer.filterQ !== undefined) filter.Q.value = layer.filterQ;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(layer.peak, startTime + layer.attack);
  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    startTime + layer.attack + layer.decay,
  );
  source.connect(filter).connect(gain).connect(destination);
  source.start(startTime);
  source.stop(startTime + duration);
}

function attachShimmer(
  context: AudioContext,
  source: AudioNode,
  destination: AudioNode,
  shimmer: Shimmer,
): void {
  const delay = context.createDelay(1);
  delay.delayTime.value = shimmer.delay;
  const feedbackFilter = context.createBiquadFilter();
  feedbackFilter.type = "lowpass";
  feedbackFilter.frequency.value = shimmer.lowpass;
  const feedbackGain = context.createGain();
  feedbackGain.gain.value = shimmer.feedback;
  const wetGain = context.createGain();
  wetGain.gain.value = shimmer.wet;
  source.connect(delay);
  delay.connect(feedbackFilter);
  feedbackFilter.connect(feedbackGain);
  feedbackGain.connect(delay);
  feedbackFilter.connect(wetGain);
  wetGain.connect(destination);
}

function sourceEnd(recipe: Recipe): number {
  return Math.max(
    ...recipe.layers.map(
      (layer) =>
        (layer.offset ?? 0) + layer.attack + layer.decay + SOURCE_STOP_PADDING,
    ),
  );
}

function shimmerTail(shimmer: Shimmer | undefined): number {
  if (!shimmer || shimmer.feedback <= 0) return 0;
  if (shimmer.feedback >= 1) return shimmer.delay;
  return (
    shimmer.delay *
    (1 + Math.ceil(Math.log(INAUDIBLE_GAIN) / Math.log(shimmer.feedback)))
  );
}

/** Renders the recipe and returns how many ms to wait before it's safe to
 * close the context (last source stopped, shimmer tail decayed below
 * audibility). */
function renderRecipe(context: AudioContext, recipe: Recipe): number {
  const now = context.currentTime;
  const master = context.createGain();
  master.gain.value = recipe.masterGain;
  master.connect(context.destination);
  if (recipe.shimmer)
    attachShimmer(context, master, context.destination, recipe.shimmer);

  for (const layer of recipe.layers) {
    const startTime = now + (layer.offset ?? 0);
    if (layer.kind === "tone") renderTone(context, master, layer, startTime);
    else renderNoise(context, master, layer, startTime);
  }

  return (
    (sourceEnd(recipe) + shimmerTail(recipe.shimmer) + CLEANUP_MARGIN) * 1000
  );
}

/**
 * Plays a sound immediately on a fresh `AudioContext`, closed once it's done
 * rendering. Safe to call from anywhere, including a still-backgrounded
 * window — a no-op when Web Audio is unavailable (SSR, old browsers) or the
 * sound name is unknown.
 */
export function play(soundId: SoundName): void {
  if (typeof window === "undefined" || !isSoundName(soundId)) return;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return;

  let ctx: AudioContext;
  try {
    ctx = new Ctor();
  } catch {
    return;
  }
  const recipe = RECIPES[soundId];
  const start = (): void => {
    const cleanupAfterMs = renderRecipe(ctx, recipe);
    setTimeout(() => void ctx.close().catch(() => {}), cleanupAfterMs);
  };
  if (ctx.state === "running") {
    start();
  } else {
    ctx.resume().then(start, () => void ctx.close().catch(() => {}));
  }
}
