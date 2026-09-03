import { describe, it, expect } from "vitest";
import {
  findTerminalOwnerId,
  MAX_EXIT_RECONNECTS,
  planCancelledInit,
  planExitStreamEnd,
  planSessionGoneAfterAttach,
} from "./terminal-lifecycle";

describe("findTerminalOwnerId", () => {
  const workspaces = [
    {
      id: "ws_a",
      terminals: [{ id: "term_a" }, { id: "term_b" }],
    },
    {
      id: "ws_c",
      terminals: [{ id: "term_c" }],
    },
  ];

  it("finds a terminal on the active workspace", () => {
    expect(findTerminalOwnerId(workspaces, "term_a")).toBe("ws_a");
  });

  it("finds a terminal on a non-active (e.g. soft-closed) workspace", () => {
    // Regression: unmount used to look up only store.activeWorkspaceId, so
    // closing the last open workspace (activeId → null) falsely treated every
    // still-persisted terminal as deleted and killed its PTY.
    expect(findTerminalOwnerId(workspaces, "term_c")).toBe("ws_c");
  });

  it("returns null when the record was removed (tab close / hard delete)", () => {
    expect(findTerminalOwnerId(workspaces, "term_gone")).toBeNull();
  });

  it("returns null for an empty workspace map (empty-state unmount)", () => {
    expect(findTerminalOwnerId([], "term_a")).toBeNull();
  });

  it("skips null/undefined workspace entries", () => {
    expect(
      findTerminalOwnerId([null, undefined, workspaces[0]], "term_b"),
    ).toBe("ws_a");
    expect(findTerminalOwnerId([null, undefined], "term_b")).toBeNull();
  });
});

describe("planExitStreamEnd", () => {
  it("reconnects while under the attempt cap (false Process-exited)", () => {
    expect(planExitStreamEnd({ exitCode: 0, reconnectCount: 0 })).toEqual({
      action: "reconnect",
      attempt: 1,
    });
    expect(planExitStreamEnd({ exitCode: 0, reconnectCount: 2 })).toEqual({
      action: "reconnect",
      attempt: 3,
    });
  });

  it("gives up at MAX_EXIT_RECONNECTS and surfaces exited", () => {
    expect(
      planExitStreamEnd({
        exitCode: 0,
        reconnectCount: MAX_EXIT_RECONNECTS,
      }),
    ).toEqual({ action: "exited", exitCode: 0 });
    expect(
      planExitStreamEnd({ exitCode: 1, reconnectCount: 5, maxReconnects: 3 }),
    ).toEqual({ action: "exited", exitCode: 1 });
  });
});

describe("planSessionGoneAfterAttach", () => {
  it("shows exited when SESSION_GONE follows a reconnect attempt", () => {
    expect(planSessionGoneAfterAttach({ pendingExitCode: 0 })).toBe("exited");
  });

  it("recreates when SESSION_GONE is a cold restore (no pending exit)", () => {
    expect(planSessionGoneAfterAttach({ pendingExitCode: null })).toBe(
      "recreate",
    );
  });
});

describe("planCancelledInit", () => {
  it("reaps a session this run spawned — nothing references it", () => {
    // The cancelled bail returns above the `tRec.sessionId` assignment, so a
    // spawned session left alive is a shell with no tab until the app quits.
    expect(planCancelledInit({ needsCreate: true })).toBe("reap");
  });

  it("leaves an attached session alone — the record still points at it", () => {
    // Killing here would destroy a live terminal the user is using; this is
    // the guard, not a nicety.
    expect(planCancelledInit({ needsCreate: false })).toBe("leave");
  });
});
