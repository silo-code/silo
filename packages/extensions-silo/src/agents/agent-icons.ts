/**
 * Per-agent brand marks for the Agents panel's icon column. Path + hex data
 * copied from icon packs rather than taken as a runtime dependency — each
 * icon is a single small SVG path, and inlining it avoids pulling in a
 * multi-thousand-icon package for six entries. Sources, per entry:
 *
 * - claude, cursor, copilot: simple-icons (CC0-1.0, https://simpleicons.org).
 * - codex, grok: simple-icons has no OpenAI/xAI marks (both were pulled from
 *   that project after trademark requests — see its DISCLAIMER.md), so these
 *   two come from `@lobehub/icons-static-svg` (MIT,
 *   https://github.com/lobehub/lobe-icons), a set curated specifically for
 *   AI-model/agent brand logos.
 * - pi: no icon pack carries a mark for it. Reuses the geometric π glyph
 *   already drawn for it on the marketing site (`apps/website/src/App.tsx`,
 *   xerro-edit) — three bars/legs plus a curled tail, combined into one path.
 * - opencode: no icon pack carries a mark for it either. Reuses OpenCode's
 *   official portrait-frame mark, the same one drawn for the marketing site
 *   (`apps/website/src/App.tsx`'s `OpencodeIcon`, sourced from paseo.sh) —
 *   uniformly rescaled from that component's `96 64 288 384` viewBox into
 *   this file's `0 0 24 24` convention. Its two source layers (an opaque
 *   border-plus-window frame, and a translucent inner panel) map directly
 *   onto {@link AgentIcon.path}/{@link AgentIcon.accentPath}.
 */

export interface AgentIcon {
  /** Display name, for the glyph's accessible label. */
  title: string;
  /**
   * The brand's color against a light background, no leading `#`.
   * "color" mode uses this or {@link hexDark} depending on the host's active
   * theme — a single hex can't have enough contrast against both a white and
   * a near-black tab strip. Claude and Codex have one color that already
   * reads fine on both, so their `hexLight`/`hexDark` match; cursor, copilot,
   * grok, and pi are genuinely black-or-nothing marks (real marks for the
   * first three, `currentColor` for pi), so those flip to white for
   * {@link hexDark} rather than going invisible against a dark background.
   */
  hexLight: string;
  /** The brand's color against a dark background, no leading `#`. See
   * {@link hexLight}. */
  hexDark: string;
  /** SVG path data, `viewBox="0 0 24 24"`. */
  path: string;
  /** Set when the source path was authored assuming `fill-rule: evenodd`
   * (codex, grok) — omit for the simple-icons paths, which assume the SVG
   * default (`nonzero`). Getting this wrong renders solid over what should be
   * a cut-out hole in the glyph. */
  fillRule?: "evenodd";
  /** A second SVG path (same viewBox) layered on top of {@link path} at 40%
   * opacity, for a source mark that is genuinely duotone rather than flat —
   * OpenCode's mark is a border plus a lighter inner panel. Omit for a flat
   * single-tone mark; flattening a duotone source into one solid fill loses
   * the panel and reads as a plain notched shape rather than a frame. */
  accentPath?: string;
  /** `fill-rule` for {@link accentPath}, independent of {@link fillRule}. */
  accentFillRule?: "evenodd";
}

const AGENT_ICONS: Record<string, AgentIcon> = {
  claude: {
    title: "Claude Code",
    hexLight: "D97757",
    hexDark: "D97757",
    path: "M21 10.5h3v3h-3v3h-1.5v3H18v-3h-1.5v3H15v-3H9v3H7.5v-3H6v3H4.5v-3H3v-3H0v-3h3v-6h18Zm-15 0h1.5v-3H6Zm10.5 0H18v-3h-1.5z",
  },
  cursor: {
    title: "Cursor",
    hexLight: "000000",
    hexDark: "FFFFFF",
    path: "M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23",
  },
  copilot: {
    title: "GitHub Copilot",
    hexLight: "000000",
    hexDark: "FFFFFF",
    path: "M23.922 16.997C23.061 18.492 18.063 22.02 12 22.02 5.937 22.02.939 18.492.078 16.997A.641.641 0 0 1 0 16.741v-2.869a.883.883 0 0 1 .053-.22c.372-.935 1.347-2.292 2.605-2.656.167-.429.414-1.055.644-1.517a10.098 10.098 0 0 1-.052-1.086c0-1.331.282-2.499 1.132-3.368.397-.406.89-.717 1.474-.952C7.255 2.937 9.248 1.98 11.978 1.98c2.731 0 4.767.957 6.166 2.093.584.235 1.077.546 1.474.952.85.869 1.132 2.037 1.132 3.368 0 .368-.014.733-.052 1.086.23.462.477 1.088.644 1.517 1.258.364 2.233 1.721 2.605 2.656a.841.841 0 0 1 .053.22v2.869a.641.641 0 0 1-.078.256Zm-11.75-5.992h-.344a4.359 4.359 0 0 1-.355.508c-.77.947-1.918 1.492-3.508 1.492-1.725 0-2.989-.359-3.782-1.259a2.137 2.137 0 0 1-.085-.104L4 11.746v6.585c1.435.779 4.514 2.179 8 2.179 3.486 0 6.565-1.4 8-2.179v-6.585l-.098-.104s-.033.045-.085.104c-.793.9-2.057 1.259-3.782 1.259-1.59 0-2.738-.545-3.508-1.492a4.359 4.359 0 0 1-.355-.508Zm2.328 3.25c.549 0 1 .451 1 1v2c0 .549-.451 1-1 1-.549 0-1-.451-1-1v-2c0-.549.451-1 1-1Zm-5 0c.549 0 1 .451 1 1v2c0 .549-.451 1-1 1-.549 0-1-.451-1-1v-2c0-.549.451-1 1-1Zm3.313-6.185c.136 1.057.403 1.913.878 2.497.442.544 1.134.938 2.344.938 1.573 0 2.292-.337 2.657-.751.384-.435.558-1.15.558-2.361 0-1.14-.243-1.847-.705-2.319-.477-.488-1.319-.862-2.824-1.025-1.487-.161-2.192.138-2.533.529-.269.307-.437.808-.438 1.578v.021c0 .265.021.562.063.893Zm-1.626 0c.042-.331.063-.628.063-.894v-.02c-.001-.77-.169-1.271-.438-1.578-.341-.391-1.046-.69-2.533-.529-1.505.163-2.347.537-2.824 1.025-.462.472-.705 1.179-.705 2.319 0 1.211.175 1.926.558 2.361.365.414 1.084.751 2.657.751 1.21 0 1.902-.394 2.344-.938.475-.584.742-1.44.878-2.497Z",
  },
  codex: {
    title: "Codex",
    hexLight: "7A9DFF",
    hexDark: "7A9DFF",
    fillRule: "evenodd",
    path: "M8.086.457a6.105 6.105 0 013.046-.415c1.333.153 2.521.72 3.564 1.7a.117.117 0 00.107.029c1.408-.346 2.762-.224 4.061.366l.063.03.154.076c1.357.703 2.33 1.77 2.918 3.198.278.679.418 1.388.421 2.126a5.655 5.655 0 01-.18 1.631.167.167 0 00.04.155 5.982 5.982 0 011.578 2.891c.385 1.901-.01 3.615-1.183 5.14l-.182.22a6.063 6.063 0 01-2.934 1.851.162.162 0 00-.108.102c-.255.736-.511 1.364-.987 1.992-1.199 1.582-2.962 2.462-4.948 2.451-1.583-.008-2.986-.587-4.21-1.736a.145.145 0 00-.14-.032c-.518.167-1.04.191-1.604.185a5.924 5.924 0 01-2.595-.622 6.058 6.058 0 01-2.146-1.781c-.203-.269-.404-.522-.551-.821a7.74 7.74 0 01-.495-1.283 6.11 6.11 0 01-.017-3.064.166.166 0 00.008-.074.115.115 0 00-.037-.064 5.958 5.958 0 01-1.38-2.202 5.196 5.196 0 01-.333-1.589 6.915 6.915 0 01.188-2.132c.45-1.484 1.309-2.648 2.577-3.493.282-.188.55-.334.802-.438.286-.12.573-.22.861-.304a.129.129 0 00.087-.087A6.016 6.016 0 015.635 2.31C6.315 1.464 7.132.846 8.086.457zm-.804 7.85a.848.848 0 00-1.473.842l1.694 2.965-1.688 2.848a.849.849 0 001.46.864l1.94-3.272a.849.849 0 00.007-.854l-1.94-3.393zm5.446 6.24a.849.849 0 000 1.695h4.848a.849.849 0 000-1.696h-4.848z",
  },
  grok: {
    title: "Grok",
    hexLight: "000000",
    hexDark: "FFFFFF",
    fillRule: "evenodd",
    path: "M9.27 15.29l7.978-5.897c.391-.29.95-.177 1.137.272.98 2.369.542 5.215-1.41 7.169-1.951 1.954-4.667 2.382-7.149 1.406l-2.711 1.257c3.889 2.661 8.611 2.003 11.562-.953 2.341-2.344 3.066-5.539 2.388-8.42l.006.007c-.983-4.232.242-5.924 2.75-9.383.06-.082.12-.164.179-.248l-3.301 3.305v-.01L9.267 15.292M7.623 16.723c-2.792-2.67-2.31-6.801.071-9.184 1.761-1.763 4.647-2.483 7.166-1.425l2.705-1.25a7.808 7.808 0 00-1.829-1A8.975 8.975 0 005.984 5.83c-2.533 2.536-3.33 6.436-1.962 9.764 1.022 2.487-.653 4.246-2.34 6.022-.599.63-1.199 1.259-1.682 1.925l7.62-6.815",
  },
  pi: {
    title: "pi",
    hexLight: "000000",
    hexDark: "FFFFFF",
    path: "M4.5,5.4 H19.5 A1.3,1.3 0 0 1 20.8,6.7 A1.3,1.3 0 0 1 19.5,8 H4.5 A1.3,1.3 0 0 1 3.2,6.7 A1.3,1.3 0 0 1 4.5,5.4 Z M7.9,8 A1.3,1.3 0 0 1 9.2,9.3 V18.1 A1.3,1.3 0 0 1 7.9,19.4 A1.3,1.3 0 0 1 6.6,18.1 V9.3 A1.3,1.3 0 0 1 7.9,8 Z M16.1,8 A1.3,1.3 0 0 1 17.4,9.3 V15.9 A1.3,1.3 0 0 1 16.1,17.2 A1.3,1.3 0 0 1 14.8,15.9 V9.3 A1.3,1.3 0 0 1 16.1,8 Z M14.8 15.6h2.6a2.6 2.6 0 0 0 2.6 2.6v2.6a5.2 5.2 0 0 1-5.2-5.2z",
  },
  opencode: {
    title: "OpenCode",
    hexLight: "000000",
    hexDark: "FFFFFF",
    fillRule: "evenodd",
    path: "M20.8 23H3.2V1H20.8V23ZM16.4 5.4H7.6V18.6H16.4V5.4Z",
    accentPath: "M16.4 9.8V18.6H7.6V9.8H16.4Z",
  },
};

/** The brand icon for an {@link AgentInfo.agentId}, or `undefined` if none is
 * known (unrecognized id). */
export function agentIconFor(
  agentId: string | undefined,
): AgentIcon | undefined {
  return agentId ? AGENT_ICONS[agentId] : undefined;
}
