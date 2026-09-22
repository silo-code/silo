import { describe, it, expect } from "vitest";
import type { AgentSessionSummary } from "@silo-code/sdk";
import {
  filterSessionSummaries,
  relativeUpdatedAt,
  resumableSessions,
  sessionSummaryTitle,
} from "./resume-session-picker";

function summary(over: Partial<AgentSessionSummary> = {}): AgentSessionSummary {
  return { sessionId: "s1", raw: {}, ...over };
}

describe("resumableSessions", () => {
  const cwd = "/ws/active";

  it("excludes this panel's own current session", () => {
    const sessions = [
      summary({ sessionId: "self", cwd }),
      summary({ sessionId: "other", cwd }),
    ];
    expect(
      resumableSessions(sessions, "self", cwd).map((s) => s.sessionId),
    ).toEqual(["other"]);
  });

  it("excludes a session whose cwd doesn't match the panel's current one", () => {
    const sessions = [
      summary({ sessionId: "same-cwd", cwd }),
      summary({ sessionId: "other-cwd", cwd: "/ws/other" }),
    ];
    expect(
      resumableSessions(sessions, undefined, cwd).map((s) => s.sessionId),
    ).toEqual(["same-cwd"]);
  });

  it("excludes a session with no reported cwd at all — cannot confirm it matches", () => {
    const sessions = [summary({ sessionId: "no-cwd" })];
    expect(resumableSessions(sessions, undefined, cwd)).toEqual([]);
  });

  it("passes through when currentSessionId is undefined", () => {
    const sessions = [summary({ sessionId: "other", cwd })];
    expect(resumableSessions(sessions, undefined, cwd)).toEqual(sessions);
  });
});

describe("filterSessionSummaries", () => {
  const sessions = [
    summary({ sessionId: "s1", title: "Fix the bug", cwd: "/ws/api" }),
    summary({ sessionId: "s2", cwd: "/ws/web" }),
  ];

  it("returns everything for an empty query", () => {
    expect(filterSessionSummaries(sessions, "")).toEqual(sessions);
    expect(filterSessionSummaries(sessions, "  ")).toEqual(sessions);
  });

  it("matches by title, case-insensitively", () => {
    expect(
      filterSessionSummaries(sessions, "FIX").map((s) => s.sessionId),
    ).toEqual(["s1"]);
  });

  it("matches by cwd", () => {
    expect(
      filterSessionSummaries(sessions, "web").map((s) => s.sessionId),
    ).toEqual(["s2"]);
  });

  it("matches by session id", () => {
    expect(
      filterSessionSummaries(sessions, "s2").map((s) => s.sessionId),
    ).toEqual(["s2"]);
  });

  it("a summary with none of the three fields present never matches a non-empty query", () => {
    const bare = [summary({ sessionId: "" })];
    expect(filterSessionSummaries(bare, "anything")).toEqual([]);
    expect(filterSessionSummaries(bare, "")).toEqual(bare);
  });
});

describe("sessionSummaryTitle", () => {
  it("prefers the agent's own title", () => {
    expect(sessionSummaryTitle(summary({ title: "Fix the bug" }))).toBe(
      "Fix the bug",
    );
  });

  it("falls back to the cwd's basename — both path styles", () => {
    expect(sessionSummaryTitle(summary({ cwd: "/ws/packages/api" }))).toBe(
      "api",
    );
    expect(sessionSummaryTitle(summary({ cwd: "C:\\ws\\packages\\api" }))).toBe(
      "api",
    );
  });

  it("falls back to a truncated session id when neither is present", () => {
    expect(sessionSummaryTitle(summary({ sessionId: "abcdefghijk" }))).toBe(
      "abcdefgh…",
    );
    expect(sessionSummaryTitle(summary({ sessionId: "short" }))).toBe("short");
  });
});

describe("relativeUpdatedAt", () => {
  const now = Date.parse("2026-09-21T12:00:00Z");

  it("returns undefined for a missing timestamp", () => {
    expect(relativeUpdatedAt(undefined, now)).toBeUndefined();
  });

  it("returns undefined for an unparsable timestamp", () => {
    expect(relativeUpdatedAt("not a date", now)).toBeUndefined();
  });

  it("returns undefined for a timestamp in the future", () => {
    expect(relativeUpdatedAt("2026-09-21T13:00:00Z", now)).toBeUndefined();
  });

  it("buckets recent times", () => {
    expect(relativeUpdatedAt("2026-09-21T11:59:45Z", now)).toBe("just now");
    expect(relativeUpdatedAt("2026-09-21T11:55:00Z", now)).toBe("5m ago");
    expect(relativeUpdatedAt("2026-09-21T09:00:00Z", now)).toBe("3h ago");
  });

  it("says yesterday for ~1-2 days ago", () => {
    expect(relativeUpdatedAt("2026-09-20T10:00:00Z", now)).toBe("yesterday");
  });

  it("counts days for the rest of the past week", () => {
    expect(relativeUpdatedAt("2026-09-17T12:00:00Z", now)).toBe("4d ago");
  });

  it("falls back to a plain date past a week old", () => {
    expect(relativeUpdatedAt("2026-08-01T12:00:00Z", now)).toBe(
      new Date(Date.parse("2026-08-01T12:00:00Z")).toLocaleDateString(),
    );
  });
});
