import { useEffect } from "react";
import { dispatchKey } from "../extension-host/keybindings";

/**
 * Global keydown dispatcher. Every shortcut now lives in the keybinding
 * registry (`registerKeybinding`) or rides on a menu item's accelerator.
 * This component just bridges DOM key events into the extension system.
 *
 * Dispatched on the **capture** phase so registered shortcuts win over focused
 * widgets that bind the same chord (notably Monaco, which claims Cmd+Alt+↑/↓
 * for multi-cursor and would otherwise `stopPropagation` before the event
 * bubbled up here). `dispatchKey` only `preventDefault`/`stopPropagation`s when
 * a binding actually matches, so plain typing falls straight through.
 */
export function Shortcuts() {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      dispatchKey(e);
    }
    window.addEventListener("keydown", onKey, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
    };
  }, []);
  return null;
}
