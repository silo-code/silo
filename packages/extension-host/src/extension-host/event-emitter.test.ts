import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "./event-emitter";

describe("EventEmitter", () => {
  it("delivers fired values to all listeners and stops after dispose", () => {
    const em = new EventEmitter<number>();
    const a = vi.fn();
    const b = vi.fn();
    const subA = em.event(a);
    em.event(b);

    em.fire(1);
    expect(a).toHaveBeenCalledWith(1);
    expect(b).toHaveBeenCalledWith(1);

    subA.dispose();
    em.fire(2);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it("snapshots listeners so (un)subscribing during dispatch is safe", () => {
    const em = new EventEmitter<void>();
    const order: string[] = [];
    // A listener that unsubscribes itself and adds a new one mid-dispatch must
    // not corrupt the in-progress iteration.
    const sub = em.event(() => {
      order.push("first");
      sub.dispose();
      em.event(() => order.push("added-during-dispatch"));
    });
    em.event(() => order.push("second"));

    expect(() => em.fire()).not.toThrow();
    // Both original listeners ran once; the one added mid-dispatch did not fire
    // for this round (it wasn't in the snapshot).
    expect(order).toEqual(["first", "second"]);
  });

  it("dispose() drops every listener", () => {
    const em = new EventEmitter<void>();
    const fn = vi.fn();
    em.event(fn);
    em.dispose();
    em.fire();
    expect(fn).not.toHaveBeenCalled();
  });
});
