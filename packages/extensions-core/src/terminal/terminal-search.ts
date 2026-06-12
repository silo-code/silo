// Pure, unit-testable logic for the terminal find overlay. The React component
// (TerminalSearch.tsx) is thin glue around these; xterm's SearchAddon does the
// actual matching.
import type { ISearchOptions } from "@xterm/addon-search";

/** The three match-mode toggles the overlay exposes (mirrors VS Code's find). */
export interface SearchFlags {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}

export const DEFAULT_SEARCH_FLAGS: SearchFlags = {
  caseSensitive: false,
  wholeWord: false,
  regex: false,
};

/**
 * Decoration colors for SearchAddon, mirroring Monaco's editor find-match
 * palette so terminal search looks identical to the editor's. Monaco uses a
 * translucent orange for all matches and a neutral fill for the focused one
 * (the active is distinguished by hue, not a border) — both readable because
 * the terminal text shows through / contrasts. See {@link MONACO_FIND_COLORS}.
 */
export interface DecorationColors {
  /**
   * Orange for all matches (Monaco `findMatchHighlightBackground`), pre-blended
   * over the terminal surface so it looks translucent despite the WebGL
   * renderer ignoring alpha — see {@link blendOver}.
   */
  match: string;
  /** Neutral fill for the focused match (Monaco `findMatchBackground`). */
  activeMatch: string;
  /** Solid color for the overview-ruler ticks. */
  ruler: string;
}

/**
 * Monaco's default find-match colors (the editor doesn't override them, so the
 * editor renders exactly these). Mirrored here so terminal search matches the
 * editor in both themes; if the editor ever themes its find colors, update
 * these to follow.
 */
export const MONACO_FIND_COLORS = {
  /** `editor.findMatchHighlightBackground` — translucent orange, both themes. */
  matchHighlight: "#ea5c0055",
  /** `editor.findMatchBackground` — olive-gray (light), blue-gray (dark). */
  activeLight: "#a8ac94",
  activeDark: "#515c6a",
  /** `editor.overviewRulerFindMatchForeground` base. */
  ruler: "#d18616",
} as const;

/**
 * Build xterm's {@link ISearchOptions} from the overlay's toggle state. The
 * count label only updates when `decorations` is set (that's what makes
 * SearchAddon count and fire `onDidChangeResults`), so decorations are always
 * included. `incremental` is only honored by `findNext` — pass it true while
 * the user types so the selection grows in place instead of jumping.
 */
export function buildSearchOptions(
  flags: SearchFlags,
  decorations: DecorationColors,
  incremental: boolean,
): ISearchOptions {
  return {
    regex: flags.regex,
    wholeWord: flags.wholeWord,
    caseSensitive: flags.caseSensitive,
    incremental,
    decorations: {
      matchBackground: decorations.match,
      matchOverviewRuler: decorations.ruler,
      activeMatchBackground: decorations.activeMatch,
      activeMatchColorOverviewRuler: decorations.ruler,
    },
  };
}

/**
 * The label shown next to the input:
 * - `""` when the query is empty (nothing searched yet),
 * - `"No results"` when a non-empty query matched nothing,
 * - `"{n} of {m}"` for a located match (resultIndex is 0-based),
 * - `"{m} matches"` when the result set exceeds the highlight threshold, in
 *   which case SearchAddon reports `resultIndex === -1` (no single active one).
 */
export function formatMatchCount(
  query: string,
  res: { resultIndex: number; resultCount: number } | null,
): string {
  if (!query) return "";
  if (!res || res.resultCount <= 0) return "No results";
  if (res.resultIndex < 0) return `${res.resultCount} matches`;
  return `${res.resultIndex + 1} of ${res.resultCount}`;
}

/**
 * Normalize a CSS color into the `#RRGGBB` form SearchAddon decorations
 * require. Accepts `rgb()`/`rgba()` (alpha dropped — decorations don't take it),
 * `#RGB` shorthand, and `#RRGGBB` (passed through). Returns null for anything
 * else so the caller can fall back to a known-good hex. DOM-dependent
 * resolution (CSS vars, named colors) belongs in the component; this stays pure.
 */
export function rgbToHex(input: string): string | null {
  const s = input.trim();
  const pair = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  if (s.startsWith("#")) {
    if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
    const short = s.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
    if (short)
      return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
    return null;
  }
  const m = s.match(/^rgba?\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+)/i);
  if (!m) return null;
  return `#${pair(Number(m[1]))}${pair(Number(m[2]))}${pair(Number(m[3]))}`;
}

/** Parse `#RGB` / `#RRGGBB` / `#RRGGBBAA` into channels (`a` in 0..1). */
function parseHexColor(
  hex: string,
): { r: number; g: number; b: number; a: number } | null {
  const s = hex.trim();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(s);
  if (short)
    return {
      r: parseInt(short[1] + short[1], 16),
      g: parseInt(short[2] + short[2], 16),
      b: parseInt(short[3] + short[3], 16),
      a: 1,
    };
  const full = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i.exec(
    s,
  );
  if (full)
    return {
      r: parseInt(full[1], 16),
      g: parseInt(full[2], 16),
      b: parseInt(full[3], 16),
      a: full[4] ? parseInt(full[4], 16) / 255 : 1,
    };
  return null;
}

/**
 * Alpha-composite a (possibly translucent) `fg` over an opaque `bg`, returning a
 * solid `#RRGGBB`. xterm's WebGL renderer paints decoration backgrounds onto its
 * canvas and **ignores their alpha**, so a translucent match color would render
 * fully opaque. Pre-blending against the terminal surface reproduces the
 * translucent look as a solid color — exactly the color Monaco ends up showing
 * when it composites its translucent find highlight over the editor background.
 * Falls back to `fg` if either input can't be parsed.
 */
export function blendOver(fg: string, bg: string): string {
  const f = parseHexColor(fg);
  const b = parseHexColor(bg);
  if (!f || !b) return fg;
  const h = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  const mix = (fc: number, bc: number) => fc * f.a + bc * (1 - f.a);
  return `#${h(mix(f.r, b.r))}${h(mix(f.g, b.g))}${h(mix(f.b, b.b))}`;
}

/** Perceived-luminance test (ITU-R BT.601) used to pick light/dark variants. */
export function isLightColor(hex: string): boolean {
  const c = parseHexColor(hex);
  if (!c) return false;
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b > 140;
}
