import { describe, it, expect, vi, afterEach } from "vitest";
import {
  normalizeUrl,
  isLocalUrl,
  pushHistory,
  tabTitleFromUrl,
  fetchPageTitle,
} from "./web-viewer-model";

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

describe("tabTitleFromUrl", () => {
  it("returns the hostname for https URLs", () => {
    expect(tabTitleFromUrl("https://github.com/silo-code/silo")).toBe(
      "github.com",
    );
  });

  it("returns the hostname for localhost URLs", () => {
    expect(tabTitleFromUrl("http://localhost:5173/app")).toBe("localhost");
  });

  it("returns the filename for file:// URLs", () => {
    expect(tabTitleFromUrl("file:///Users/dev/report.html")).toBe(
      "report.html",
    );
  });

  it("returns the path when file:// has no filename segment", () => {
    expect(tabTitleFromUrl("file:///")).toBe("/");
  });

  it("returns the raw string for unparseable input", () => {
    expect(tabTitleFromUrl("not-a-url")).toBe("not-a-url");
  });
});

describe("fetchPageTitle", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns the <title> text on a successful HTML response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "text/html; charset=utf-8" },
        text: async () => "<html><head><title>Silo Docs</title></head></html>",
      }),
    );
    expect(await fetchPageTitle("http://localhost:5173")).toBe("Silo Docs");
  });

  it("returns null when the response is not HTML", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        text: async () => "{}",
      }),
    );
    expect(await fetchPageTitle("http://localhost:3000/api")).toBeNull();
  });

  it("returns null when the response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        headers: { get: () => "text/html" },
        text: async () => "Not found",
      }),
    );
    expect(await fetchPageTitle("http://localhost:5173/404")).toBeNull();
  });

  it("returns null when fetch throws (CORS block, network error, timeout)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    expect(await fetchPageTitle("https://github.com")).toBeNull();
  });

  it("returns null when the HTML has no <title>", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "text/html" },
        text: async () => "<html><head></head><body></body></html>",
      }),
    );
    expect(await fetchPageTitle("http://localhost:5173")).toBeNull();
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
