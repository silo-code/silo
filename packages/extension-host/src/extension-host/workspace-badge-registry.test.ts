import { describe, it, expect, afterEach } from "vitest";
import { workspaceBadgeRegistry } from "./workspace-badge-registry";
import type { WorkspaceBadgeProvider } from "@silo-code/sdk";

function makeProvider(
  id: string,
  badges: { id: string; text: string; color?: string }[] = [],
): WorkspaceBadgeProvider {
  return { id, provide: () => badges };
}

const disposables: { dispose(): void }[] = [];

afterEach(() => {
  for (const d of disposables.splice(0)) d.dispose();
});

function register(provider: WorkspaceBadgeProvider) {
  const d = workspaceBadgeRegistry.register(provider);
  disposables.push(d);
  return d;
}

describe("register / unregister", () => {
  it("returns badges from provider after registering", () => {
    register(makeProvider("a", [{ id: "b1", text: "hello" }]));
    expect(workspaceBadgeRegistry.getBadges("ws1")).toEqual([
      { id: "b1", text: "hello" },
    ]);
  });

  it("returns no badges after dispose", () => {
    const d = workspaceBadgeRegistry.register(
      makeProvider("b", [{ id: "b2", text: "gone" }]),
    );
    d.dispose();
    expect(workspaceBadgeRegistry.getBadges("ws1")).toEqual([]);
  });

  it("double-dispose is a no-op", () => {
    const p = makeProvider("c", [{ id: "b3", text: "x" }]);
    const d = workspaceBadgeRegistry.register(p);
    d.dispose();
    expect(() => d.dispose()).not.toThrow();
    expect(workspaceBadgeRegistry.getBadges("ws1")).toEqual([]);
  });
});

describe("getBadges()", () => {
  it("concatenates badges from multiple providers in registration order", () => {
    register(makeProvider("p1", [{ id: "x", text: "first" }]));
    register(makeProvider("p2", [{ id: "y", text: "second" }]));
    expect(workspaceBadgeRegistry.getBadges("ws1")).toEqual([
      { id: "x", text: "first" },
      { id: "y", text: "second" },
    ]);
  });

  it("skips providers that return empty arrays", () => {
    register(makeProvider("empty", []));
    register(makeProvider("has", [{ id: "z", text: "only" }]));
    expect(workspaceBadgeRegistry.getBadges("ws1")).toEqual([
      { id: "z", text: "only" },
    ]);
  });
});

describe("set / clear", () => {
  it("merges imperative badges ahead of binders", () => {
    register(makeProvider("p", [{ id: "from-bind", text: "b" }]));
    workspaceBadgeRegistry.set("ws1", { id: "imp", text: "a" });
    expect(workspaceBadgeRegistry.getBadges("ws1")).toEqual([
      { id: "imp", text: "a" },
      { id: "from-bind", text: "b" },
    ]);
    workspaceBadgeRegistry.clear("ws1", "imp");
    expect(workspaceBadgeRegistry.getBadges("ws1")).toEqual([
      { id: "from-bind", text: "b" },
    ]);
  });
});

describe("subscribe()", () => {
  it("fires listener when a provider is registered", () => {
    let calls = 0;
    const sub = workspaceBadgeRegistry.subscribe(() => calls++);
    disposables.push(sub);
    register(makeProvider("s1"));
    expect(calls).toBe(1);
  });

  it("fires listener when a provider is unregistered", () => {
    const p = makeProvider("s2");
    const d = workspaceBadgeRegistry.register(p);
    let calls = 0;
    const sub = workspaceBadgeRegistry.subscribe(() => calls++);
    disposables.push(sub);
    d.dispose();
    expect(calls).toBe(1);
  });

  it("does not fire listener after subscription is disposed", () => {
    let calls = 0;
    const sub = workspaceBadgeRegistry.subscribe(() => calls++);
    sub.dispose();
    register(makeProvider("s3"));
    expect(calls).toBe(0);
  });
});
