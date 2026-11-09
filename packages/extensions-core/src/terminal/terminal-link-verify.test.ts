import { describe, expect, it, vi } from "vitest";
import { createPathVerifier } from "./terminal-link-verify";
import type { FilePathSpan } from "./terminal-link-match";

const LINE = "Edit /Users/me/docs/Global Navigation/Overview.md now";
const SPAN: FilePathSpan = {
  text: "/Users/me/docs/Global",
  index: LINE.indexOf("/Users"),
  href: "/Users/me/docs/Global",
};

function verifier(onDisk: readonly string[], timeoutMs?: number) {
  const exists = vi.fn(async (p: string) => onDisk.includes(p));
  const v = createPathVerifier({
    exists,
    resolve: (candidate) => candidate,
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  });
  return { v, exists };
}

describe("createPathVerifier", () => {
  it("takes the longest reading that exists", async () => {
    const { v, exists } = verifier([
      "/Users/me/docs/Global Navigation/Overview.md",
      "/Users/me/docs/Global",
    ]);
    await expect(v.verify(LINE, SPAN, "/ws")).resolves.toBe(
      "/Users/me/docs/Global Navigation/Overview.md",
    );
    // Longest first: only `…/Overview.md now` is asked about ahead of it, and
    // the span's own text is never reached.
    expect(exists.mock.calls.map((c) => c[0])).toEqual([
      "/Users/me/docs/Global Navigation/Overview.md now",
      "/Users/me/docs/Global Navigation/Overview.md",
    ]);
  });

  it("falls back to the span's own text when nothing exists", async () => {
    const { v, exists } = verifier([]);
    await expect(v.verify(LINE, SPAN, "/ws")).resolves.toBe(SPAN.text);
    expect(exists.mock.calls.length).toBeGreaterThan(1);
  });

  it("issues no probe at all for an unambiguous span", async () => {
    const line = "see /etc/hosts";
    const span: FilePathSpan = {
      text: "/etc/hosts",
      index: 4,
      href: "/etc/hosts",
    };
    const { v, exists } = verifier(["/etc/hosts"]);
    await expect(v.verify(line, span, "/ws")).resolves.toBe("/etc/hosts");
    expect(exists).not.toHaveBeenCalled();
  });

  it("caches a miss, so a second hover costs nothing", async () => {
    const { v, exists } = verifier([]);
    await v.verify(LINE, SPAN, "/ws");
    const first = exists.mock.calls.length;
    await v.verify(LINE, SPAN, "/ws");
    expect(exists.mock.calls.length).toBe(first);
  });

  it("re-probes when the base directory differs", async () => {
    const { v, exists } = verifier([]);
    await v.verify(LINE, SPAN, "/ws");
    const first = exists.mock.calls.length;
    await v.verify(LINE, SPAN, "/other");
    expect(exists.mock.calls.length).toBeGreaterThan(first);
  });

  it("coalesces concurrent walks of the same span", async () => {
    const { v, exists } = verifier([]);
    const [a, b] = await Promise.all([
      v.verify(LINE, SPAN, "/ws"),
      v.verify(LINE, SPAN, "/ws"),
    ]);
    expect(a).toBe(b);
    const walked = exists.mock.calls.length;
    await v.verify(LINE, SPAN, "/ws");
    // One walk, not two — and the cached answer adds none.
    expect(exists.mock.calls.length).toBe(walked);
  });

  it("accepts a file that doesn't exist yet when its directory does", async () => {
    // An agent announcing a file it is about to write — the link has to work
    // before the write lands, or the most interesting path in the row is dead.
    const line = "Write /Users/me/docs/Global Navigation/New Post.md";
    const span: FilePathSpan = {
      text: "/Users/me/docs/Global",
      index: line.indexOf("/Users"),
      href: "/Users/me/docs/Global",
    };
    const { v } = verifier(["/Users/me/docs/Global Navigation"]);
    await expect(v.verify(line, span, "/ws")).resolves.toBe(
      "/Users/me/docs/Global Navigation/New Post.md",
    );
  });

  it("does not let that rule swallow prose", async () => {
    // `/tmp` exists, but the reading adds no directory level the span lacked,
    // so `and b.txt` stays prose.
    const line = "wrote /tmp/a and b.txt";
    const span: FilePathSpan = {
      text: "/tmp/a",
      index: 6,
      href: "/tmp/a",
    };
    const { v } = verifier(["/tmp"]);
    await expect(v.verify(line, span, "/ws")).resolves.toBe("/tmp/a");

    // And a reading whose tail isn't a filename can't pass on its directory.
    const { v: v2 } = verifier(["/Users/me/docs/Global Navigation"]);
    await expect(v2.verify(LINE, SPAN, "/ws")).resolves.toBe(
      "/Users/me/docs/Global Navigation/Overview.md",
    );
  });

  it("treats a rejected probe as 'does not exist'", async () => {
    const exists = vi.fn(async () => {
      throw new Error("EACCES");
    });
    const v = createPathVerifier({ exists, resolve: (c) => c });
    await expect(v.verify(LINE, SPAN, "/ws")).resolves.toBe(SPAN.text);
  });

  it("abandons a probe that never answers", async () => {
    vi.useFakeTimers();
    try {
      const v = createPathVerifier({
        exists: () => new Promise<boolean>(() => {}),
        resolve: (c) => c,
        timeoutMs: 200,
      });
      const result = v.verify(LINE, SPAN, "/ws");
      await vi.advanceTimersByTimeAsync(1000);
      await expect(result).resolves.toBe(SPAN.text);
    } finally {
      vi.useRealTimers();
    }
  });

  it("resolves a relative candidate against the base dir before probing", async () => {
    const line = "wrote docs/My Notes/a.txt here";
    const span: FilePathSpan = {
      text: "docs/My",
      index: 6,
      href: "docs/My",
    };
    const exists = vi.fn(async (p: string) => p === "/ws/docs/My Notes/a.txt");
    const v = createPathVerifier({
      exists,
      resolve: (candidate, baseDir) =>
        candidate.startsWith("/") ? candidate : `${baseDir}/${candidate}`,
    });
    await expect(v.verify(line, span, "/ws")).resolves.toBe(
      "docs/My Notes/a.txt",
    );
  });
});
