import { describe, it, expect } from "vitest";
import {
  continueInNewSessionOption,
  isReadOnly,
  panelStateAfterConnect,
  resolveChatCwd,
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
