import { describe, it, expect } from "vitest";
import {
  parseEngineFloor,
  compareVersions,
  isEngineCompatible,
} from "./engine-compat";

describe("parseEngineFloor", () => {
  it.each([
    ["^0.17.0", [0, 17, 0]],
    ["~0.17.0", [0, 17, 0]],
    [">=0.17.0", [0, 17, 0]],
    ["0.17.0", [0, 17, 0]],
    ["<=0.17.0", [0, 17, 0]],
    [">0.17.0", [0, 17, 0]],
    ["<0.17.0", [0, 17, 0]],
    ["=0.17.0", [0, 17, 0]],
  ])("parses %s as floor %j", (input, expected) => {
    expect(parseEngineFloor(input)).toEqual(expected);
  });

  it("defaults missing minor/patch to 0", () => {
    expect(parseEngineFloor("^1")).toEqual([1, 0, 0]);
    expect(parseEngineFloor("^1.2")).toEqual([1, 2, 0]);
  });

  it("returns null for absent, empty, or garbage input", () => {
    expect(parseEngineFloor(undefined)).toBeNull();
    expect(parseEngineFloor("")).toBeNull();
    expect(parseEngineFloor("not-a-version")).toBeNull();
    expect(parseEngineFloor("^")).toBeNull();
  });

  it("strips pre-release suffix from engine string", () => {
    expect(parseEngineFloor("0.17.0-beta.1")).toEqual([0, 17, 0]);
  });
});

describe("compareVersions", () => {
  it("returns 0 for equal versions", () => {
    expect(compareVersions([1, 2, 3], [1, 2, 3])).toBe(0);
  });

  it("major beats minor and patch", () => {
    expect(compareVersions([1, 0, 0], [0, 99, 99])).toBeGreaterThan(0);
    expect(compareVersions([0, 99, 99], [1, 0, 0])).toBeLessThan(0);
  });

  it("minor beats patch", () => {
    expect(compareVersions([0, 2, 0], [0, 1, 99])).toBeGreaterThan(0);
    expect(compareVersions([0, 1, 99], [0, 2, 0])).toBeLessThan(0);
  });

  it("patch tie-break", () => {
    expect(compareVersions([0, 0, 2], [0, 0, 1])).toBeGreaterThan(0);
    expect(compareVersions([0, 0, 1], [0, 0, 2])).toBeLessThan(0);
  });
});

describe("isEngineCompatible", () => {
  it("is compatible when engine is absent or empty", () => {
    expect(isEngineCompatible(undefined, "0.1.0")).toBe(true);
    expect(isEngineCompatible("", "0.1.0")).toBe(true);
  });

  it("is compatible when engine is garbage (no constraint)", () => {
    expect(isEngineCompatible("not-a-version", "0.1.0")).toBe(true);
  });

  it("host below floor → incompatible", () => {
    expect(isEngineCompatible("^0.17.0", "0.16.5")).toBe(false);
    expect(isEngineCompatible("^0.17.0", "0.16.99")).toBe(false);
  });

  it("host equal to floor → compatible (>=)", () => {
    expect(isEngineCompatible("^0.17.0", "0.17.0")).toBe(true);
  });

  it("host above floor → compatible", () => {
    expect(isEngineCompatible("^0.17.0", "0.18.0")).toBe(true);
    expect(isEngineCompatible("^0.17.0", "1.0.0")).toBe(true);
  });

  it("host with pre-release suffix is compared on numeric core only", () => {
    expect(isEngineCompatible("^0.17.0", "0.18.0-beta.1")).toBe(true);
    expect(isEngineCompatible("^0.17.0", "0.16.0-rc.1")).toBe(false);
  });

  it("is compatible when host version is unreadable", () => {
    expect(isEngineCompatible("^0.17.0", "")).toBe(true);
    expect(isEngineCompatible("^0.17.0", "not-a-version")).toBe(true);
  });

  it("existing ^0.15.0 extensions stay compatible on 0.17+ hosts", () => {
    expect(isEngineCompatible("^0.15.0", "0.17.0")).toBe(true);
    expect(isEngineCompatible("^0.15.0", "0.15.0")).toBe(true);
  });
});
