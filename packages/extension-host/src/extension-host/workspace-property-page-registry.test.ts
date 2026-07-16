import { describe, it, expect, afterEach } from "vitest";
import { workspacePropertyPageRegistry } from "./workspace-property-page-registry";
import type { WorkspacePropertyPage } from "@silo-code/sdk";

function makePage(id: string, order?: number): WorkspacePropertyPage {
  return { id, title: id, component: () => null, order };
}

const disposables: { dispose(): void }[] = [];

afterEach(() => {
  // Dispose any pages registered during the test so module state stays clean.
  for (const d of disposables.splice(0)) d.dispose();
});

function register(page: WorkspacePropertyPage) {
  const d = workspacePropertyPageRegistry.register(page);
  disposables.push(d);
  return d;
}

describe("register / unregister", () => {
  it("appears in list after registering", () => {
    const p = makePage("a");
    register(p);
    expect(workspacePropertyPageRegistry.list()).toContain(p);
  });

  it("disappears from list after dispose", () => {
    const p = makePage("b");
    const d = workspacePropertyPageRegistry.register(p);
    d.dispose();
    expect(workspacePropertyPageRegistry.list()).not.toContain(p);
  });

  it("double-dispose is a no-op", () => {
    const p = makePage("c");
    const d = workspacePropertyPageRegistry.register(p);
    d.dispose();
    expect(() => d.dispose()).not.toThrow();
    expect(workspacePropertyPageRegistry.list()).not.toContain(p);
  });

  it("throws on duplicate page id", () => {
    register(makePage("dup"));
    expect(() =>
      workspacePropertyPageRegistry.register(makePage("dup")),
    ).toThrow(/duplicate id "dup"/);
  });

  it("allows re-registering an id after its page is disposed", () => {
    const d = workspacePropertyPageRegistry.register(makePage("cycle"));
    d.dispose();
    expect(() => register(makePage("cycle"))).not.toThrow();
  });
});

describe("list() ordering", () => {
  it("sorts pages by order ascending", () => {
    register(makePage("x10", 10));
    register(makePage("x1", 1));
    register(makePage("x5", 5));
    const ids = workspacePropertyPageRegistry.list().map((p) => p.id);
    expect(ids.indexOf("x1")).toBeLessThan(ids.indexOf("x5"));
    expect(ids.indexOf("x5")).toBeLessThan(ids.indexOf("x10"));
  });

  it("treats missing order as 0", () => {
    register(makePage("zero")); // order undefined → 0
    register(makePage("neg", -1));
    const ids = workspacePropertyPageRegistry.list().map((p) => p.id);
    expect(ids.indexOf("neg")).toBeLessThan(ids.indexOf("zero"));
  });

  it("preserves registration order for equal order values", () => {
    register(makePage("eqA", 0));
    register(makePage("eqB", 0));
    const ids = workspacePropertyPageRegistry.list().map((p) => p.id);
    expect(ids.indexOf("eqA")).toBeLessThan(ids.indexOf("eqB"));
  });
});

describe("subscribe", () => {
  it("fires listener when a page is registered", () => {
    let calls = 0;
    const sub = workspacePropertyPageRegistry.subscribe(() => calls++);
    disposables.push(sub);
    register(makePage("s1"));
    expect(calls).toBe(1);
  });

  it("fires listener when a page is unregistered", () => {
    const d = workspacePropertyPageRegistry.register(makePage("s2"));
    let calls = 0;
    const sub = workspacePropertyPageRegistry.subscribe(() => calls++);
    disposables.push(sub);
    d.dispose();
    expect(calls).toBe(1);
  });

  it("does not fire listener after subscription is disposed", () => {
    let calls = 0;
    const sub = workspacePropertyPageRegistry.subscribe(() => calls++);
    sub.dispose();
    register(makePage("s3"));
    expect(calls).toBe(0);
  });
});
