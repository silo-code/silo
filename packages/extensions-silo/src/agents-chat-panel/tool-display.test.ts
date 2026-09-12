import { describe, it, expect } from "vitest";
import {
  formatToolKindLabel,
  isMcpToolTitle,
  toolIconId,
} from "./tool-display";

describe("formatToolKindLabel", () => {
  it("capitalizes a regular kind", () => {
    expect(formatToolKindLabel("read")).toBe("Read");
    expect(formatToolKindLabel("search")).toBe("Search");
    expect(formatToolKindLabel("READ")).toBe("Read");
  });

  it("renames execute to Shell and capitalizes edit", () => {
    expect(formatToolKindLabel("execute")).toBe("Shell");
    expect(formatToolKindLabel("edit")).toBe("Edit");
  });

  it("turns underscored kinds into a single capitalized phrase", () => {
    expect(formatToolKindLabel("switch_mode")).toBe("Switch mode");
  });

  it("hides Other when the title is already an MCP tool name", () => {
    expect(formatToolKindLabel("other", "mcp__plugin_xerro__search")).toBe(
      undefined,
    );
    expect(formatToolKindLabel("other", "Read file")).toBe("Other");
  });

  it("returns nothing when the agent gave no kind", () => {
    expect(formatToolKindLabel(undefined)).toBeUndefined();
    expect(formatToolKindLabel("  ")).toBeUndefined();
  });

  it("capitalizes an unknown vendor kind rather than dropping it", () => {
    expect(formatToolKindLabel("grep")).toBe("Grep");
  });
});

describe("toolIconId", () => {
  it("maps each protocol kind to a glyph", () => {
    expect(toolIconId("execute")).toBe("shell");
    expect(toolIconId("read")).toBe("read");
    expect(toolIconId("edit")).toBe("write");
    expect(toolIconId("search")).toBe("search");
    expect(toolIconId("delete")).toBe("delete");
    expect(toolIconId("move")).toBe("move");
    expect(toolIconId("think")).toBe("think");
    expect(toolIconId("fetch")).toBe("fetch");
    expect(toolIconId("switch_mode")).toBe("switch");
  });

  it("uses the plug for MCP titles when kind is other or missing", () => {
    expect(toolIconId("other", "mcp__plugin_x")).toBe("mcp");
    expect(toolIconId(undefined, "mcp-server-foo")).toBe("mcp");
  });

  it("does not let an MCP-shaped filename override a real kind", () => {
    expect(toolIconId("read", "mcp-notes.md")).toBe("read");
  });

  it("falls back to the generic wrench for unknown or empty kinds", () => {
    expect(toolIconId("grep")).toBe("other");
    expect(toolIconId(undefined, "Read file")).toBe("other");
  });
});

describe("isMcpToolTitle", () => {
  it("matches mcp, mcp__, and mcp- prefixes", () => {
    expect(isMcpToolTitle("mcp")).toBe(true);
    expect(isMcpToolTitle("mcp__plugin_x")).toBe(true);
    expect(isMcpToolTitle("mcp-server")).toBe(true);
    expect(isMcpToolTitle("MCP__FOO")).toBe(true);
  });

  it("does not treat a mid-title mention as MCP", () => {
    expect(isMcpToolTitle("Read mcp-notes.md")).toBe(false);
    expect(isMcpToolTitle("compile")).toBe(false);
  });
});
