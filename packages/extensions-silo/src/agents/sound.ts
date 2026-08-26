/**
 * Plays the working → waiting notification sound, gated on the user's
 * settings and debounced so several terminals finishing at once don't stack
 * overlapping tones. Kept separate from `index.tsx` so the debounce logic is
 * unit-testable without the SDK.
 */

import { play, type SoundName } from "./synth";
import { settingsService } from "./settings-store";

const DEBOUNCE_MS = 750;
let lastPlayedAt = 0;

/** Called from `dispatch()` whenever an agent stops working, regardless of
 * whether its terminal is currently focused. */
export function maybePlayTransitionSound(now: number = Date.now()): void {
  const { soundEnabled, soundId } = settingsService.getState();
  if (!soundEnabled) return;
  if (now - lastPlayedAt < DEBOUNCE_MS) return;
  lastPlayedAt = now;
  play(soundId);
}

/** Called from the settings page's preview button — bypasses the enabled
 * flag and debounce so every click is audible. */
export function previewSound(soundId: SoundName): void {
  play(soundId);
}
