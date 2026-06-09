// Paste-mode modifier tracker (Shift).
//
// WebKit (Tauri's webview) suppresses every JS key event while an HTML5
// drag is in flight on macOS, so DOM `keydown`/`keyup` alone can't drive
// the paste toggle. The Rust side installs a CGEventSource poll that
// reads the HID-level modifier state (unaffected by AppKit's drag
// session) and emits `app:shift-state`. We listen to that and mirror
// the value into the same flag the DOM listeners write to, so callers
// get one source of truth regardless of drag state.

import { listen } from "@tauri-apps/api/event";

let shiftHeld = false;

function isShiftKey(e: KeyboardEvent): boolean {
  return e.key === "Shift" || e.code === "ShiftLeft" || e.code === "ShiftRight";
}

if (typeof window !== "undefined") {
  const onDown = (e: KeyboardEvent) => {
    if (isShiftKey(e)) shiftHeld = true;
  };
  const onUp = (e: KeyboardEvent) => {
    if (isShiftKey(e)) shiftHeld = false;
  };
  window.addEventListener("keydown", onDown, true);
  window.addEventListener("keyup", onUp, true);
  document.addEventListener("keydown", onDown, true);
  document.addEventListener("keyup", onUp, true);
  // Intentionally no blur-reset — the webview can briefly lose focus
  // during a drop and a blur-reset would clear state milliseconds before
  // our drop handlers read it.

  // Native bridge — AppKit local NSEvent monitors go silent during the
  // webview's drag session, but a CGEventSource poll in Rust still sees
  // Shift transitions and emits this event.
  listen<boolean>("app:shift-state", (event) => {
    shiftHeld = event.payload;
  }).catch(() => {
    // Listening can fail in non-Tauri test environments — safe to ignore.
  });
}

export function isPasteModifierHeld(): boolean {
  return shiftHeld;
}

export function isPasteModifierActive(event: { shiftKey: boolean }): boolean {
  return event.shiftKey || shiftHeld;
}
