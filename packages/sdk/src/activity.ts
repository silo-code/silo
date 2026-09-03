import type { AgentActivity } from "./agents-service";

/**
 * Host-owned activity state for chrome (workspace rows, CenterDock tabs,
 * SideDock tabs, and the public {@link Activity} glyph). Extensions pick a
 * kind only — never an icon, color, or motion. See ADR 0030.
 *
 * @category Core Types
 * @public
 */
export type Activity = "working" | "ready" | "warn" | "error";

/**
 * Glyph size for {@link Activity}. `"sm"` (8px at the default `uiFontSize`) is
 * the workbench size — workspace status rows and CenterDock / SideDock tabs;
 * `"md"` (10px) is the roomier one, for a list that leads with the dot rather
 * than tucking it into chrome. Both scale with `uiFontSize` rather than being
 * fixed pixels.
 *
 * @category Core Types
 * @public
 */
export type ActivitySize = "sm" | "md";

/**
 * Map {@link AgentActivity} onto UI {@link Activity}. Returns `null` when there
 * is nothing to paint (`none` / `dead` — callers may map `dead` → `"error"`
 * themselves if they want chrome).
 *
 * @category Core Types
 * @public
 */
export function activityFromAgent(a: AgentActivity): Activity | null {
  switch (a) {
    case "working":
      return "working";
    case "idle":
      return "ready";
    case "error":
      return "error";
    case "none":
    case "dead":
      return null;
  }
}

/**
 * Resolve the host `.silo-activity*` class string. Pinned by unit tests
 * (RFC 0016 class-contract pattern). When `activity` is omitted, uses the
 * neutral workspace fallback (gray “none” look).
 *
 * @internal
 */
export function activityClass(
  activity: Activity | undefined,
  size: ActivitySize = "sm",
): string {
  const kind = activity ?? "none";
  return `silo-activity silo-activity-${kind} silo-activity-${size}`;
}

/**
 * Deterministic per-instance `animation-delay` (via the `--silo-activity-jitter`
 * custom property) for an animated {@link Activity} glyph, keyed off a stable id
 * — a row or terminal id, not an array index. Two purposes:
 *
 * - **Desync.** Several `working` / `ready` glyphs rendered side by side would
 *   otherwise pulse in perfect lockstep; a per-id offset staggers them.
 * - **Start mid-cycle.** The value is a *negative* delay, so the animation
 *   mounts already in progress rather than pausing on first paint — a WebKit
 *   quirk that bites when the glyph is created inside a container that was
 *   `display: none` moments earlier (e.g. a Navigator view on its first
 *   activation), where a zero delay can leave the pulse frozen until the next
 *   show/hide toggle.
 *
 * Hashed rather than random so the offset is stable across re-renders. Pinned
 * by unit tests.
 *
 * @internal
 */
export function activityJitterStyle(
  key: string,
): Record<"--silo-activity-jitter", string> {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  // 1.8s is the longest activity animation period (`silo-activity-wave`), so the
  // offset spans one full cycle.
  const delaySeconds = -(((hash >>> 0) % 1000) / 1000) * 1.8;
  return { "--silo-activity-jitter": `${delaySeconds.toFixed(3)}s` };
}
