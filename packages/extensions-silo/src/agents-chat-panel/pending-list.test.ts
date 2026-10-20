import { describe, it, expect } from "vitest";
import { patchByKey, removeByKey } from "./pending-list";

interface Row {
  readonly key: string;
  readonly value: string;
  readonly extra?: string;
}

const list: readonly Row[] = [
  { key: "a", value: "1" },
  { key: "b", value: "2" },
];

describe("patchByKey", () => {
  it("replaces only the entry with that key", () => {
    expect(patchByKey(list, "b", (r) => ({ ...r, value: "changed" }))).toEqual([
      { key: "a", value: "1" },
      { key: "b", value: "changed" },
    ]);
  });

  it("keeps untouched entries object-identical, so React can skip them", () => {
    const next = patchByKey(list, "b", (r) => ({ ...r, value: "changed" }));
    expect(next[0]).toBe(list[0]);
    expect(next[1]).not.toBe(list[1]);
  });

  // The bug this module exists for. Two updates from one handler: the first
  // replaces the entry, so the second must still find it — by key, since the
  // object it was handed is no longer in the list.
  it("finds the entry again after a previous patch replaced it", () => {
    const once = patchByKey(list, "a", (r) => ({ ...r, value: "first" }));
    const twice = patchByKey(once, "a", (r) => ({ ...r, extra: "second" }));
    expect(twice[0]).toEqual({ key: "a", value: "first", extra: "second" });
  });

  // A request answered and retired between render and click.
  it("is a no-op for a key that is gone", () => {
    expect(patchByKey(list, "vanished", (r) => ({ ...r, value: "x" }))).toEqual(
      list,
    );
  });
});

describe("removeByKey", () => {
  it("drops just that entry", () => {
    expect(removeByKey(list, "a")).toEqual([{ key: "b", value: "2" }]);
  });

  it("leaves the list alone when the key is gone", () => {
    expect(removeByKey(list, "vanished")).toEqual(list);
  });
});
