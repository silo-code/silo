import { describe, it, expect, afterEach, vi } from "vitest";
import {
  setActiveTerminal,
  getActiveTerminal,
  subscribeActiveTerminal,
} from "./active-terminal-registry";

// The registry is a module singleton; reset it after each test so state
// doesn't leak across cases.
afterEach(() => {
  setActiveTerminal(null);
});

describe("active-terminal-registry", () => {
  it("starts with no active terminal", () => {
    expect(getActiveTerminal()).toBeNull();
  });

  it("stores the active terminal and notifies subscribers", () => {
    const listener = vi.fn();
    const sub = subscribeActiveTerminal(listener);
    setActiveTerminal("term_1");
    expect(getActiveTerminal()).toBe("term_1");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith("term_1");
    sub.dispose();
  });

  it("does not re-notify when the value is unchanged", () => {
    const listener = vi.fn();
    const sub = subscribeActiveTerminal(listener);
    setActiveTerminal("term_1");
    setActiveTerminal("term_1");
    expect(listener).toHaveBeenCalledTimes(1);
    sub.dispose();
  });

  it("notifies with null when the terminal deactivates", () => {
    const listener = vi.fn();
    setActiveTerminal("term_1");
    const sub = subscribeActiveTerminal(listener);
    setActiveTerminal(null);
    expect(getActiveTerminal()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(null);
    sub.dispose();
  });

  it("stops delivering after dispose", () => {
    const listener = vi.fn();
    const sub = subscribeActiveTerminal(listener);
    sub.dispose();
    setActiveTerminal("term_1");
    expect(listener).not.toHaveBeenCalled();
  });

  it("notifies every subscriber", () => {
    const a = vi.fn();
    const b = vi.fn();
    const subA = subscribeActiveTerminal(a);
    const subB = subscribeActiveTerminal(b);
    setActiveTerminal("term_2");
    expect(a).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledWith("term_2");
    expect(b).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledWith("term_2");
    subA.dispose();
    subB.dispose();
  });
});
