import { describe, it, expect } from "vitest";
import {
  continueInNewSessionOption,
  isReadOnly,
  panelStateAfterConnect,
  resumeOptionFor,
} from "./session-restore";

describe("resumeOptionFor", () => {
  it("is undefined for a brand-new panel (no persisted sessionId)", () => {
    expect(resumeOptionFor(undefined)).toBeUndefined();
    expect(resumeOptionFor(null)).toBeUndefined();
  });

  it("wraps a persisted sessionId as a restore target", () => {
    expect(resumeOptionFor("s1")).toEqual({ sessionId: "s1" });
  });
});

describe("continueInNewSessionOption", () => {
  it("keeps the original sessionId and sets startFresh", () => {
    expect(continueInNewSessionOption("s1")).toEqual({
      sessionId: "s1",
      startFresh: true,
    });
  });
});

describe("panelStateAfterConnect", () => {
  it("persists the handle's own sessionId, not necessarily what was asked for", () => {
    expect(
      panelStateAfterConnect("claude-chat", { sessionId: "adopted" }, "/ws"),
    ).toEqual({ profileId: "claude-chat", sessionId: "adopted", cwd: "/ws" });
  });
});

describe("isReadOnly", () => {
  it("is read-only only for journal-only", () => {
    expect(isReadOnly("journal-only")).toBe(true);
    expect(isReadOnly("new")).toBe(false);
    expect(isReadOnly("resumed")).toBe(false);
    expect(isReadOnly(undefined)).toBe(false);
  });
});
