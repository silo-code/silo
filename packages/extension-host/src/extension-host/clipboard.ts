import { readText } from "@tauri-apps/plugin-clipboard-manager";

// Host-mediated clipboard read for core UI. WebKit in WKWebView treats
// `navigator.clipboard.readText()` as privacy-sensitive and shows a native
// "Paste" permission bubble that loses user-activation by the time it's
// clicked (e.g. terminal context-menu Paste). The Tauri plugin reads straight
// from the OS pasteboard via Rust instead.

/** Plain-text clipboard contents, or `""` when empty. */
export function readClipboardText(): Promise<string> {
  return readText();
}
