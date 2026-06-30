import { describe, expect, it } from "vitest";
import { isExternalImageUrl, resolveLocalImagePath } from "./resolveImageSrc";

describe("isExternalImageUrl", () => {
  it("recognises http:// URLs", () => {
    expect(isExternalImageUrl("http://example.com/img.png")).toBe(true);
  });

  it("recognises https:// URLs", () => {
    expect(isExternalImageUrl("https://img.shields.io/badge.svg")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isExternalImageUrl("HTTP://example.com/img.png")).toBe(true);
    expect(isExternalImageUrl("HTTPS://example.com/img.png")).toBe(true);
  });

  it("returns false for relative paths", () => {
    expect(isExternalImageUrl("./assets/logo.png")).toBe(false);
    expect(isExternalImageUrl("../img.jpg")).toBe(false);
    expect(isExternalImageUrl("assets/logo.png")).toBe(false);
  });

  it("returns false for absolute local paths", () => {
    expect(isExternalImageUrl("/Users/me/images/logo.png")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isExternalImageUrl("")).toBe(false);
  });

  it("returns false for data: URIs", () => {
    expect(isExternalImageUrl("data:image/png;base64,abc")).toBe(false);
  });
});

describe("resolveLocalImagePath", () => {
  const file = "/Users/me/project/docs/README.md";

  it("resolves a same-directory relative path", () => {
    expect(resolveLocalImagePath("assets/logo.png", file)).toBe(
      "/Users/me/project/docs/assets/logo.png",
    );
  });

  it("resolves a ./ prefixed relative path", () => {
    expect(resolveLocalImagePath("./assets/logo.png", file)).toBe(
      "/Users/me/project/docs/assets/logo.png",
    );
  });

  it("resolves a ../ parent-directory path", () => {
    expect(resolveLocalImagePath("../images/logo.png", file)).toBe(
      "/Users/me/project/images/logo.png",
    );
  });

  it("returns an absolute local path unchanged", () => {
    expect(resolveLocalImagePath("/Users/me/images/logo.png", file)).toBe(
      "/Users/me/images/logo.png",
    );
  });

  it("returns null for http URLs", () => {
    expect(resolveLocalImagePath("http://example.com/img.png", file)).toBeNull();
  });

  it("returns null for https URLs", () => {
    expect(resolveLocalImagePath("https://example.com/img.png", file)).toBeNull();
  });

  it("returns null for protocol-relative URLs", () => {
    expect(resolveLocalImagePath("//example.com/img.png", file)).toBeNull();
  });

  it("returns null for data: URIs", () => {
    expect(resolveLocalImagePath("data:image/png;base64,abc", file)).toBeNull();
  });

  it("returns null when filePath is null", () => {
    expect(resolveLocalImagePath("assets/logo.png", null)).toBeNull();
  });

  it("returns null for empty src", () => {
    expect(resolveLocalImagePath("", file)).toBeNull();
  });

  it("strips ?query before resolving", () => {
    expect(resolveLocalImagePath("assets/logo.png?v=2", file)).toBe(
      "/Users/me/project/docs/assets/logo.png",
    );
  });

  it("strips #fragment before resolving", () => {
    expect(resolveLocalImagePath("assets/diagram.svg#section", file)).toBe(
      "/Users/me/project/docs/assets/diagram.svg",
    );
  });

  it("decodes %20-encoded spaces in path segments", () => {
    expect(resolveLocalImagePath("my%20images/logo.png", file)).toBe(
      "/Users/me/project/docs/my images/logo.png",
    );
  });
});
