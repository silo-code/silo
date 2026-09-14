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

/** Called from `dispatch()` whenever a Chat session starts blocking on a
 *  permission answer (`activity: "blocked"`), regardless of whether its tab
 *  is currently focused — independently enabled from the stop-working sound
 *  above, since "the agent needs you" and "the agent is done" are different
 *  enough alerts to want separately. Shares `lastPlayedAt` with
 *  `maybePlayTransitionSound` so the two never overlap. */
export function maybePlayBlockedSound(now: number = Date.now()): void {
  const { blockedSoundEnabled, blockedSoundId } = settingsService.getState();
  if (!blockedSoundEnabled) return;
  if (now - lastPlayedAt < DEBOUNCE_MS) return;
  lastPlayedAt = now;
  play(blockedSoundId);
}

/** Called from the settings page's preview button — bypasses the enabled
 * flag and debounce so every click is audible. */
export function previewSound(soundId: SoundName): void {
  play(soundId);
}
