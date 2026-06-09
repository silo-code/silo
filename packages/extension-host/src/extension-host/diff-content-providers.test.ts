import { describe, it, expect } from "vitest";
import {
  registerDiffContentProvider,
  getDiffContentProvider,
} from "./diff-content-providers";
import type { DiffContentProvider } from "@silo-code/sdk";

const noop: DiffContentProvider = async () => ({ original: "", modified: "" });

describe("diff-content-providers", () => {
  it("registers, resolves, and disposes a provider", () => {
    const id = `test.${Math.random().toString(36).slice(2)}`;
    expect(getDiffContentProvider(id)).toBeUndefined();
    const reg = registerDiffContentProvider(id, noop);
    expect(getDiffContentProvider(id)).toBe(noop);
    reg.dispose();
    expect(getDiffContentProvider(id)).toBeUndefined();
  });

  it("rejects a duplicate id", () => {
    const id = `test.${Math.random().toString(36).slice(2)}`;
    const reg = registerDiffContentProvider(id, noop);
    expect(() => registerDiffContentProvider(id, noop)).toThrow(/already/);
    reg.dispose();
  });
});
