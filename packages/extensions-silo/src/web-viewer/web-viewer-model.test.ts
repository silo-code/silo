import { describe, it, expect } from "vitest";
import { normalizeUrl, isLocalUrl, pushHistory } from "./web-viewer-model";

describe("normalizeUrl", () => {
  it("returns null for empty/whitespace strings", () => {
    expect(normalizeUrl("")).toBeNull();
    expect(normalizeUrl("   ")).toBeNull();
  });

  it("prepends https:// when no scheme is present", () => {
    expect(normalizeUrl("example.com")).toBe("https://example.com");
    expect(normalizeUrl("  example.com  ")).toBe("https://example.com");
  });

  it("leaves existing https:// URLs unchanged", () => {
    expect(normalizeUrl("https://example.com/path")).toBe(
      "https://example.com/path",
    );
  });

  it("leaves http:// URLs unchanged", () => {
    expect(normalizeUrl("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("leaves file:// URLs unchanged", () => {
    expect(normalizeUrl("file:///Users/dev/report.html")).toBe(
      "file:///Users/dev/report.html",
    );
  });

  it("returns null for strings unparseable as a URL", () => {
    expect(normalizeUrl("not a url at all !!!")).toBeNull();
  });
});

describe("isLocalUrl", () => {
  it("returns true for localhost http URLs", () => {
    expect(isLocalUrl("http://localhost:5173")).toBe(true);
    expect(isLocalUrl("http://localhost")).toBe(true);
  });

  it("returns true for 127.0.0.1 http URLs", () => {
    expect(isLocalUrl("http://127.0.0.1:8080")).toBe(true);
  });

  it("returns true for file:// URLs", () => {
    expect(isLocalUrl("file:///Users/dev/index.html")).toBe(true);
  });

  it("returns false for remote https URLs", () => {
    expect(isLocalUrl("https://example.com")).toBe(false);
  });

  it("returns false for unparseable strings", () => {
    expect(isLocalUrl("not-a-url")).toBe(false);
  });
});

describe("pushHistory", () => {
  it("appends to an empty history", () => {
    const result = pushHistory([], -1, "https://a.com");
    expect(result).toEqual({ history: ["https://a.com"], index: 0 });
  });

  it("appends after the current index", () => {
    const result = pushHistory(["https://a.com"], 0, "https://b.com");
    expect(result).toEqual({
      history: ["https://a.com", "https://b.com"],
      index: 1,
    });
  });

  it("trims forward entries when navigating from mid-history", () => {
    const history = ["https://a.com", "https://b.com", "https://c.com"];
    const result = pushHistory(history, 1, "https://d.com");
    expect(result).toEqual({
      history: ["https://a.com", "https://b.com", "https://d.com"],
      index: 2,
    });
  });

  it("does not mutate the original history array", () => {
    const original = ["https://a.com"];
    pushHistory(original, 0, "https://b.com");
    expect(original).toEqual(["https://a.com"]);
  });
});
