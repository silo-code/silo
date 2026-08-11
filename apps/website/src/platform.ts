/** Client platform for the marketing Download CTA icon. */

export type DownloadPlatform = "mac" | "windows" | "linux";

/**
 * Best-effort UA/platform sniff for which Download glyph to show.
 * Defaults to mac — Silo's primary audience — when unknown.
 */
export function detectDownloadPlatform(
  ua = typeof navigator !== "undefined" ? navigator.userAgent : "",
  platform = typeof navigator !== "undefined" ? navigator.platform : "",
): DownloadPlatform {
  if (/Win/i.test(platform) || /Windows/i.test(ua)) return "windows";
  if (/Linux/i.test(platform) || (/Linux/i.test(ua) && !/Android/i.test(ua))) {
    return "linux";
  }
  return "mac";
}
