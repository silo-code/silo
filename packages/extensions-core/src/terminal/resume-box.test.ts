import { describe, expect, it } from "vitest";
import { formatResumeBox } from "./resume-box";

// Strip ANSI SGR sequences so the tests assert on the visible box geometry,
// not the color codes.
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

describe("formatResumeBox", () => {
  it("draws a rounded box sized to the message with one space of padding", () => {
    const lines = stripAnsi(formatResumeBox(["hi"])).split("\r\n");
    // leading blank line, top, middle, bottom, trailing empty (from final \r\n)
    expect(lines[0]).toBe("");
    expect(lines[1]).toBe("╭────╮");
    expect(lines[2]).toBe("│ hi │");
    expect(lines[3]).toBe("╰────╯");
  });

  it("sizes to the widest line and left-pads the shorter ones", () => {
    const lines = stripAnsi(
      formatResumeBox(["Resume with:", "claude --resume abc123"]),
    ).split("\r\n");
    const [, top, row1, row2, bottom] = lines;
    // All box lines share the width of the widest content line.
    expect(top.length).toBe(row1.length);
    expect(row1.length).toBe(row2.length);
    expect(bottom.length).toBe(row2.length);
    // Shorter line is left-aligned: content then padding then border.
    expect(row1).toBe("│ Resume with:           │");
    expect(row2).toBe("│ claude --resume abc123 │");
  });

  it("borders open and close with rounded corners", () => {
    const lines = stripAnsi(formatResumeBox(["x"])).split("\r\n");
    const [, top, , bottom] = lines;
    expect(top.startsWith("╭")).toBe(true);
    expect(top.endsWith("╮")).toBe(true);
    expect(bottom.startsWith("╰")).toBe(true);
    expect(bottom.endsWith("╯")).toBe(true);
  });

  it("wraps in bold-yellow and resets on every line", () => {
    const out = formatResumeBox(["a", "b"]);
    // Four colored segments (top, two rows, bottom), each reset.
    expect(out.match(/\x1b\[1;33m/g)).toHaveLength(4);
    expect(out.match(/\x1b\[0m/g)).toHaveLength(4);
    expect(out.startsWith("\r\n")).toBe(true);
    expect(out.endsWith("\r\n")).toBe(true);
  });

  it("counts an em dash and multibyte content as one visible column each", () => {
    const lines = stripAnsi(formatResumeBox(["a—b"])).split("\r\n");
    // 3 visible chars + 2 padding = 5 dashes.
    expect(lines[1]).toBe("╭─────╮");
    expect(lines[2]).toBe("│ a—b │");
  });
});
