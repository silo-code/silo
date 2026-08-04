import { afterEach, describe, expect, it } from "vitest";
import {
  requestPanelActivation,
  peekPanelActivation,
  clearPanelActivation,
} from "./panel-activation-requests";

afterEach(() => {
  clearPanelActivation("w1");
  clearPanelActivation("w2");
});

describe("panel activation requests", () => {
  it("has no request for a workspace nobody asked about", () => {
    expect(peekPanelActivation("w1")).toBeNull();
  });

  it("records a request and keeps it readable until cleared", () => {
    requestPanelActivation("w1", "terminal:t1");
    // Peek must NOT consume: the dock reads the request on activation and again
    // from onDidAddPanel, because the panel may not be mounted the first time.
    expect(peekPanelActivation("w1")).toBe("terminal:t1");
    expect(peekPanelActivation("w1")).toBe("terminal:t1");
  });

  it("keeps requests per workspace", () => {
    requestPanelActivation("w1", "terminal:t1");
    requestPanelActivation("w2", "editor:e9");
    expect(peekPanelActivation("w1")).toBe("terminal:t1");
    expect(peekPanelActivation("w2")).toBe("editor:e9");
  });

  it("lets a newer request for the same workspace replace an older one", () => {
    // Two rapid clicks in a side panel: the last one is the live intent.
    requestPanelActivation("w1", "terminal:t1");
    requestPanelActivation("w1", "terminal:t2");
    expect(peekPanelActivation("w1")).toBe("terminal:t2");
  });

  it("clears only the named workspace", () => {
    requestPanelActivation("w1", "terminal:t1");
    requestPanelActivation("w2", "terminal:t2");
    clearPanelActivation("w1");
    expect(peekPanelActivation("w1")).toBeNull();
    expect(peekPanelActivation("w2")).toBe("terminal:t2");
  });

  it("tolerates clearing a workspace with no pending request", () => {
    expect(() => clearPanelActivation("w1")).not.toThrow();
    expect(peekPanelActivation("w1")).toBeNull();
  });
});
