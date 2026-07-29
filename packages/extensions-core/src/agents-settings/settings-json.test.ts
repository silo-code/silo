import { describe, it, expect } from "vitest";
import {
  parseSettingsJsonText,
  writableSettingsOrThrow,
  UnreadableSettingsError,
} from "./settings-json";

const PATH = "/Users/x/.claude/settings.json";

describe("parseSettingsJsonText", () => {
  it("treats null text as missing", () => {
    expect(parseSettingsJsonText(null, PATH)).toEqual({ kind: "missing" });
  });

  it("parses a JSON object", () => {
    expect(parseSettingsJsonText('{"hooks":{}}', PATH)).toEqual({
      kind: "ok",
      value: { hooks: {} },
    });
  });

  it("rejects invalid JSON", () => {
    const r = parseSettingsJsonText("{not json", PATH);
    expect(r.kind).toBe("invalid");
    if (r.kind === "invalid") {
      expect(r.message).toContain(PATH);
      expect(r.message).toMatch(/not valid JSON/i);
    }
  });

  it("rejects JSON arrays and primitives", () => {
    expect(parseSettingsJsonText("[]", PATH).kind).toBe("invalid");
    expect(parseSettingsJsonText('"x"', PATH).kind).toBe("invalid");
    expect(parseSettingsJsonText("1", PATH).kind).toBe("invalid");
  });
});

describe("writableSettingsOrThrow", () => {
  it("returns {} for a missing file", () => {
    expect(writableSettingsOrThrow({ kind: "missing" }, PATH)).toEqual({});
  });

  it("returns the value for an ok read", () => {
    const value = { hooks: { SessionStart: [] } };
    expect(writableSettingsOrThrow({ kind: "ok", value }, PATH)).toBe(value);
  });

  it("throws UnreadableSettingsError for invalid so callers cannot overwrite", () => {
    expect(() =>
      writableSettingsOrThrow(
        {
          kind: "invalid",
          message: `Settings file is not valid JSON: ${PATH}`,
        },
        PATH,
      ),
    ).toThrow(UnreadableSettingsError);
  });
});
