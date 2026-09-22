import { describe, it, expect } from "vitest";
import {
  continueInNewSessionOption,
  isReadOnly,
  panelStateAfterConnect,
  resolveChatCwd,
  restoreOptionFor,
  resumeOptionFor,
  sessionResetOption,
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

  it("omits an empty cwd rather than stranding every later restore on it", () => {
    expect(
      panelStateAfterConnect("claude-chat", { sessionId: "s1" }, ""),
    ).not.toHaveProperty("cwd");
  });
});

// The folder a Chat session runs in became the panel's own (RFC 0046) rather
// than always the workspace's primary one — that is the whole point in a
// multi-root workspace, where the other roots were previously unreachable.
describe("resolveChatCwd", () => {
  it("prefers the folder this panel was started in", () => {
    expect(resolveChatCwd("/ws/packages/api", "/ws")).toBe("/ws/packages/api");
  });

  it("falls back to the workspace folder when nothing is persisted", () => {
    expect(resolveChatCwd(undefined, "/ws")).toBe("/ws");
  });

  it("treats an empty persisted value as nothing, not as an answer", () => {
    // `??` would pin the panel to "" forever after one bad connect; `||` is
    // load-bearing here, not a style choice.
    expect(resolveChatCwd("", "/ws")).toBe("/ws");
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

describe("sessionResetOption", () => {
  it("skips resume/load and discards the journal — Clear, not recovery", () => {
    expect(sessionResetOption("s1")).toEqual({
      sessionId: "s1",
      startFresh: true,
      transcript: "discard",
    });
  });
});

describe("restoreOptionFor", () => {
  it("takes the normal resume path with no intent", () => {
    expect(restoreOptionFor("s1", null)).toEqual({ sessionId: "s1" });
  });

  it("carries the journal for a continuation and drops it for a reset", () => {
    expect(restoreOptionFor("s1", "continue-fresh")).toEqual({
      sessionId: "s1",
      startFresh: true,
    });
    expect(restoreOptionFor("s1", "reset")).toEqual({
      sessionId: "s1",
      startFresh: true,
      transcript: "discard",
    });
  });

  it("is undefined without a session id, whatever the intent", () => {
    expect(restoreOptionFor(undefined, "reset")).toBeUndefined();
    expect(restoreOptionFor(null, null)).toBeUndefined();
  });

  // Session Discovery (RFC 0051): picking a different, already-existing
  // session from the agent's own `session/list` is a plain resume, not a
  // fresh start — no `startFresh`, no `transcript`.
  it("resumes a picked session plainly, same as no intent", () => {
    expect(restoreOptionFor("other-id", "resume-other")).toEqual({
      sessionId: "other-id",
    });
  });
});
