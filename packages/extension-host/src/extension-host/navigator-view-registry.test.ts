import { describe, it, expect, afterEach } from "vitest";
import { navigatorViewRegistry } from "./navigator-view-registry";
import type { NavigatorView } from "@silo-code/sdk";

function makeView(id: string, order?: number): NavigatorView {
  return { id, title: id, component: () => null, order };
}

const disposables: { dispose(): void }[] = [];

afterEach(() => {
  // Dispose any views registered during the test so module state stays clean.
  for (const d of disposables.splice(0)) d.dispose();
});

function register(view: NavigatorView) {
  const d = navigatorViewRegistry.register(view);
  disposables.push(d);
  return d;
}

describe("register / unregister", () => {
  it("appears in list after registering", () => {
    const v = makeView("a");
    register(v);
    expect(navigatorViewRegistry.list()).toContain(v);
  });

  it("disappears from list after dispose", () => {
    const v = makeView("b");
    const d = navigatorViewRegistry.register(v);
    d.dispose();
    // Remove from afterEach tracking since we already disposed.
    const idx = disposables.indexOf(d);
    if (idx !== -1) disposables.splice(idx, 1);
    expect(navigatorViewRegistry.list()).not.toContain(v);
  });

  it("double-dispose is a no-op", () => {
    const v = makeView("c");
    const d = navigatorViewRegistry.register(v);
    d.dispose();
    expect(() => d.dispose()).not.toThrow();
    expect(navigatorViewRegistry.list()).not.toContain(v);
  });

  it("throws on duplicate view id", () => {
    register(makeView("dup"));
    expect(() => navigatorViewRegistry.register(makeView("dup"))).toThrow(
      /duplicate id "dup"/,
    );
  });

  it("allows re-registering the same id after dispose", () => {
    const d = navigatorViewRegistry.register(makeView("reuse"));
    d.dispose();
    const idx = disposables.indexOf(d);
    if (idx !== -1) disposables.splice(idx, 1);
    expect(() => register(makeView("reuse"))).not.toThrow();
    expect(navigatorViewRegistry.list().map((v) => v.id)).toContain("reuse");
  });
});

describe("list() ordering", () => {
  it("sorts views by order ascending", () => {
    register(makeView("x10", 10));
    register(makeView("x1", 1));
    register(makeView("x5", 5));
    const ids = navigatorViewRegistry.list().map((v) => v.id);
    expect(ids.indexOf("x1")).toBeLessThan(ids.indexOf("x5"));
    expect(ids.indexOf("x5")).toBeLessThan(ids.indexOf("x10"));
  });

  it("treats missing order as 0", () => {
    register(makeView("zero")); // order undefined → 0
    register(makeView("neg", -1));
    const ids = navigatorViewRegistry.list().map((v) => v.id);
    expect(ids.indexOf("neg")).toBeLessThan(ids.indexOf("zero"));
  });

  it("preserves registration order for equal order values", () => {
    register(makeView("eqA", 0));
    register(makeView("eqB", 0));
    const ids = navigatorViewRegistry.list().map((v) => v.id);
    expect(ids.indexOf("eqA")).toBeLessThan(ids.indexOf("eqB"));
  });
});

describe("subscribe", () => {
  it("fires listener when a view is registered", () => {
    let calls = 0;
    const sub = navigatorViewRegistry.subscribe(() => calls++);
    disposables.push(sub);
    register(makeView("s1"));
    expect(calls).toBe(1);
  });

  it("fires listener when a view is unregistered", () => {
    const d = navigatorViewRegistry.register(makeView("s2"));
    let calls = 0;
    const sub = navigatorViewRegistry.subscribe(() => calls++);
    disposables.push(sub);
    d.dispose();
    expect(calls).toBe(1);
  });

  it("does not fire listener after subscription is disposed", () => {
    let calls = 0;
    const sub = navigatorViewRegistry.subscribe(() => calls++);
    sub.dispose();
    register(makeView("s3"));
    expect(calls).toBe(0);
  });
});
