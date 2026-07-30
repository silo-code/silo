// The inert "terminal restarted" notice Silo writes into a terminal whose
// agent died (RFC 0018, ctx.agents). Rendered as a bold-yellow box drawn with
// Unicode box-drawing characters so the resume hint stands out from the
// surrounding shell output rather than blending in as one more dashed line.

const BOLD_YELLOW = "\x1b[1;33m";
const RESET = "\x1b[0m";

/** Visible column width of a string. Counts by code point (so surrogate
 * pairs are one unit); ASCII paths and the em dash are all width 1, which is
 * all the resume hint ever contains, so no East-Asian-width table is needed. */
function visibleWidth(text: string): number {
  return Array.from(text).length;
}

/**
 * Wrap one or more message lines in a bold-yellow rounded box for terminal
 * display.
 *
 * Returns a string of xterm-ready output: a leading blank line, then the box —
 * top border, one ` │ line │ ` row per message line (each left-aligned and
 * padded to the widest line), bottom border — each `\r\n`-terminated and
 * individually colored+reset, sized to the widest line. Every line carries its
 * own color reset so a mid-box remount or scrollback trim can't leave the rest
 * of the terminal tinted.
 */
export function formatResumeBox(lines: string[]): string {
  const width = Math.max(...lines.map(visibleWidth));
  const inner = width + 2; // one space of padding each side
  const top = `${BOLD_YELLOW}╭${"─".repeat(inner)}╮${RESET}`;
  const bottom = `${BOLD_YELLOW}╰${"─".repeat(inner)}╯${RESET}`;
  const rows = lines.map((line) => {
    const pad = " ".repeat(width - visibleWidth(line));
    return `${BOLD_YELLOW}│ ${line}${pad} │${RESET}`;
  });
  return `\r\n${[top, ...rows, bottom].join("\r\n")}\r\n`;
}
