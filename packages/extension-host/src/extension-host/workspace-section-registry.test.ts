import { describe, it, expect, afterEach } from "vitest";
import { workspaceSectionRegistry } from "./workspace-section-registry";
import type { WorkspaceSectionProvider } from "@silo-code/sdk";

function makeProvider(id: string, order?: number): WorkspaceSectionProvider {
  return { id, component: () => null, order };
}

const disposables: { dispose(): void }[] = [];

afterEach(() => {
  // Dispose any providers registered during the test so module state stays clean.
  for (const d of disposables.splice(0)) d.dispose();
});

function register(provider: WorkspaceSectionProvider) {
  const d = workspaceSectionRegistry.register(provider);
  disposables.push(d);
  return d;
}

describe("register / unregister", () => {
  it("appears in list after registering", () => {
    const p = makeProvider("a");
    register(p);
    expect(workspaceSectionRegistry.list()).toContain(p);
  });

  it("disappears from list after dispose", () => {
    const p = makeProvider("b");
    const d = workspaceSectionRegistry.register(p);
    d.dispose();
    // Remove from afterEach tracking since we already disposed.
    const idx = disposables.indexOf(d);
    if (idx !== -1) disposables.splice(idx, 1);
    expect(workspaceSectionRegistry.list()).not.toContain(p);
  });

  it("double-dispose is a no-op", () => {
    const p = makeProvider("c");
    const d = workspaceSectionRegistry.register(p);
    d.dispose();
    expect(() => d.dispose()).not.toThrow();
    expect(workspaceSectionRegistry.list()).not.toContain(p);
  });
});

describe("list() ordering", () => {
  it("sorts providers by order ascending", () => {
    const p10 = makeProvider("x10", 10);
    const p1 = makeProvider("x1", 1);
    const p5 = makeProvider("x5", 5);
    register(p10);
    register(p1);
    register(p5);
    const ids = workspaceSectionRegistry.list().map((p) => p.id);
    const i1 = ids.indexOf("x1");
    const i5 = ids.indexOf("x5");
    const i10 = ids.indexOf("x10");
    expect(i1).toBeLessThan(i5);
    expect(i5).toBeLessThan(i10);
  });

  it("treats missing order as 0", () => {
    const p0 = makeProvider("zero"); // order undefined → 0
    const pNeg = makeProvider("neg", -1);
    register(p0);
    register(pNeg);
    const ids = workspaceSectionRegistry.list().map((p) => p.id);
    expect(ids.indexOf("neg")).toBeLessThan(ids.indexOf("zero"));
  });

  it("preserves registration order for equal order values", () => {
    const pA = makeProvider("eqA", 0);
    const pB = makeProvider("eqB", 0);
    register(pA);
    register(pB);
    const ids = workspaceSectionRegistry.list().map((p) => p.id);
    expect(ids.indexOf("eqA")).toBeLessThan(ids.indexOf("eqB"));
  });
});

describe("subscribe", () => {
  it("fires listener when a provider is registered", () => {
    let calls = 0;
    const sub = workspaceSectionRegistry.subscribe(() => calls++);
    disposables.push(sub);
    register(makeProvider("s1"));
    expect(calls).toBe(1);
  });

  it("fires listener when a provider is unregistered", () => {
    const p = makeProvider("s2");
    const d = workspaceSectionRegistry.register(p);
    let calls = 0;
    const sub = workspaceSectionRegistry.subscribe(() => calls++);
    disposables.push(sub);
    d.dispose();
    expect(calls).toBe(1);
  });

  it("does not fire listener after subscription is disposed", () => {
    let calls = 0;
    const sub = workspaceSectionRegistry.subscribe(() => calls++);
    sub.dispose();
    register(makeProvider("s3"));
    expect(calls).toBe(0);
  });
});
