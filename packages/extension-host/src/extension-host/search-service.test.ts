import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchResponse } from "@silo-code/sdk";

// Mock the Tauri boundary. `vi.hoisted` is required because `vi.mock` factories
// and the mocked-module import are hoisted above top-level `const`s.
const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { getSearchService } from "./search-service";

const EMPTY: SearchResponse = { files: [], totalMatches: 0, truncated: false };
const svc = getSearchService();

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(EMPTY);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("search cancellation (B11)", () => {
  it("forwards the query to the native command and resolves without a signal", async () => {
    const res = await svc.search("tokyo", { cwd: "/root" });
    expect(res).toEqual(EMPTY);
    expect(invokeMock).toHaveBeenCalledWith(
      "search_files",
      expect.objectContaining({ query: "tokyo" }),
    );
    // The AbortSignal must never be forwarded to Tauri (it isn't serializable).
    const [, payload] = invokeMock.mock.calls[0];
    expect(payload).not.toHaveProperty("signal");
    expect(payload.options).not.toHaveProperty("signal");
  });

  it("rejects immediately with an AbortError when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      svc.search("tokyo", { cwd: "/root", signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects with an AbortError when aborted mid-flight, discarding the result", async () => {
    let resolveNative!: (r: SearchResponse) => void;
    invokeMock.mockReturnValueOnce(
      new Promise<SearchResponse>((r) => {
        resolveNative = r;
      }),
    );
    const controller = new AbortController();
    const p = svc.search("tokyo", { cwd: "/root", signal: controller.signal });
    controller.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
    // The native run finishing later must not throw / resurface the result.
    resolveNative(EMPTY);
    await Promise.resolve();
  });

  it("still resolves when the signal aborts only after the search completed", async () => {
    const controller = new AbortController();
    const res = await svc.search("tokyo", {
      cwd: "/root",
      signal: controller.signal,
    });
    controller.abort(); // late abort — must not turn the settled result into a rejection
    expect(res).toEqual(EMPTY);
  });
});
