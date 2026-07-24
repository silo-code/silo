import { describe, it, expect } from "vitest";
import {
  currentView,
  INITIAL_STACK,
  popView,
  pushView,
  restoreStack,
  ROOT_VIEW,
  serializeStack,
} from "./view-stack";

describe("pushView / popView / currentView", () => {
  it("starts at root", () => {
    expect(currentView(INITIAL_STACK)).toEqual(ROOT_VIEW);
  });

  it("pushes onto the stack and pop reverses it", () => {
    let stack = pushView(INITIAL_STACK, { kind: "commits" });
    expect(currentView(stack)).toEqual({ kind: "commits" });

    stack = pushView(stack, { kind: "commit-detail", hash: "abc123" });
    expect(currentView(stack)).toEqual({
      kind: "commit-detail",
      hash: "abc123",
    });

    stack = popView(stack);
    expect(currentView(stack)).toEqual({ kind: "commits" });

    stack = popView(stack);
    expect(currentView(stack)).toEqual(ROOT_VIEW);
  });

  it("popping the root is a no-op — the root can't be popped", () => {
    const popped = popView(INITIAL_STACK);
    expect(popped).toBe(INITIAL_STACK);
    expect(currentView(popped)).toEqual(ROOT_VIEW);
  });
});

describe("serializeStack / restoreStack", () => {
  it("round-trips a multi-level stack", () => {
    const stack = pushView(pushView(INITIAL_STACK, { kind: "commits" }), {
      kind: "commit-detail",
      hash: "deadbeef",
    });
    const restored = restoreStack(serializeStack(stack));
    expect(restored).toEqual(stack);
  });

  it("falls back to root for a missing or malformed value", () => {
    expect(restoreStack(undefined)).toEqual(INITIAL_STACK);
    expect(restoreStack(null)).toEqual(INITIAL_STACK);
    expect(restoreStack("not an array")).toEqual(INITIAL_STACK);
  });

  it("drops malformed entries but keeps the well-formed ones", () => {
    const raw = [
      { kind: "root" },
      { kind: "nonsense" },
      { kind: "commit-detail" }, // missing hash
      { kind: "commit-detail", hash: "ok" },
    ];
    expect(restoreStack(raw)).toEqual({
      views: [ROOT_VIEW, { kind: "commit-detail", hash: "ok" }],
    });
  });

  it("falls back to root when every entry is malformed", () => {
    expect(restoreStack([{ kind: "nonsense" }])).toEqual(INITIAL_STACK);
  });
});
