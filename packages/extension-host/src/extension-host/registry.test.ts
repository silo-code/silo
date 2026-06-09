import { describe, it, expect, vi } from "vitest";
import { Registry } from "./registry";

interface Item {
  id: string;
  label?: string;
}

describe("Registry", () => {
  it("registers and retrieves entries by id", () => {
    const r = new Registry<Item>();
    r.register({ id: "a", label: "A" });
    expect(r.get("a")).toEqual({ id: "a", label: "A" });
    expect(r.get("missing")).toBeUndefined();
  });

  it("throws on duplicate id", () => {
    const r = new Registry<Item>();
    r.register({ id: "a" });
    expect(() => r.register({ id: "a" })).toThrow(/duplicate id "a"/);
  });

  it("dispose removes the entry", () => {
    const r = new Registry<Item>();
    const handle = r.register({ id: "a" });
    handle.dispose();
    expect(r.get("a")).toBeUndefined();
    // A second dispose is a no-op (already gone).
    expect(() => handle.dispose()).not.toThrow();
  });

  it("returns a stable list reference until the next mutation", () => {
    const r = new Registry<Item>();
    r.register({ id: "a" });
    const first = r.list();
    expect(r.list()).toBe(first); // cached, same reference
    r.register({ id: "b" });
    const second = r.list();
    expect(second).not.toBe(first); // invalidated by mutation
    expect(second.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("notifies onChange listeners on register and dispose, and stops after dispose-of-listener", () => {
    const r = new Registry<Item>();
    const fn = vi.fn();
    const sub = r.onChange(fn);
    const h = r.register({ id: "a" });
    h.dispose();
    expect(fn).toHaveBeenCalledTimes(2);
    sub.dispose();
    r.register({ id: "b" });
    expect(fn).toHaveBeenCalledTimes(2); // no longer listening
  });
});
