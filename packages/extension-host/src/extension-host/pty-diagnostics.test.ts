import { describe, it, expect } from "vitest";
import {
  collectLivePtys,
  summarizePtysByWorkspace,
  formatPtyEventMessage,
  formatPtySummaryMessage,
  type PtyEntry,
  type PtyWorkspaceInput,
} from "./pty-diagnostics";
import type { TerminalRecord } from "../state/types";

function terminal(overrides: Partial<TerminalRecord> = {}): TerminalRecord {
  return {
    id: "term_1",
    sessionId: "sess_1",
    kind: "shell",
    title: "bash",
    ...overrides,
  };
}

function workspace(
  overrides: Partial<PtyWorkspaceInput> = {},
): PtyWorkspaceInput {
  return {
    id: "ws_1",
    name: "my-project",
    closedAt: null,
    terminals: [],
    ...overrides,
  };
}

describe("collectLivePtys", () => {
  it("flattens spawned terminals across workspaces", () => {
    const workspaces = {
      ws_1: workspace({
        id: "ws_1",
        name: "a",
        terminals: [terminal({ id: "t1", sessionId: "s1", title: "bash" })],
      }),
      ws_2: workspace({
        id: "ws_2",
        name: "b",
        closedAt: "2026-01-01T00:00:00.000Z",
        terminals: [
          terminal({ id: "t2", sessionId: "s2", cwd: "/tmp", title: "zsh" }),
        ],
      }),
    };

    const entries = collectLivePtys(workspaces);

    expect(entries).toEqual([
      {
        workspaceId: "ws_1",
        workspaceName: "a",
        workspaceClosed: false,
        terminalId: "t1",
        terminalName: "bash",
        sessionId: "s1",
        cwd: undefined,
      },
      {
        workspaceId: "ws_2",
        workspaceName: "b",
        workspaceClosed: true,
        terminalId: "t2",
        terminalName: "zsh",
        sessionId: "s2",
        cwd: "/tmp",
      },
    ]);
  });

  it("prefers the user's custom name over the PTY-derived title", () => {
    const workspaces = {
      ws_1: workspace({
        terminals: [
          terminal({
            id: "t1",
            sessionId: "s1",
            title: "npm run dev",
            customName: "dev server",
          }),
        ],
      }),
    };

    expect(collectLivePtys(workspaces)[0].terminalName).toBe("dev server");
  });

  it("falls back to the title when customName was cleared to empty string", () => {
    const workspaces = {
      ws_1: workspace({
        terminals: [
          terminal({
            id: "t1",
            sessionId: "s1",
            title: "bash",
            customName: "",
          }),
        ],
      }),
    };

    expect(collectLivePtys(workspaces)[0].terminalName).toBe("bash");
  });

  it("skips terminals that haven't spawned a PTY yet (empty sessionId)", () => {
    const workspaces = {
      ws_1: workspace({
        terminals: [
          terminal({ id: "t1", sessionId: "" }),
          terminal({ id: "t2", sessionId: "s2" }),
        ],
      }),
    };

    const entries = collectLivePtys(workspaces);

    expect(entries.map((e) => e.terminalId)).toEqual(["t2"]);
  });

  it("skips undefined workspace entries", () => {
    const workspaces = { ws_1: undefined };
    expect(collectLivePtys(workspaces)).toEqual([]);
  });
});

describe("summarizePtysByWorkspace", () => {
  it("rolls up count + terminal names per workspace, with no ids", () => {
    const entries: PtyEntry[] = [
      {
        workspaceId: "ws_1",
        workspaceName: "a",
        workspaceClosed: false,
        terminalId: "t1",
        terminalName: "bash",
        sessionId: "s1",
      },
      {
        workspaceId: "ws_1",
        workspaceName: "a",
        workspaceClosed: false,
        terminalId: "t2",
        terminalName: "claude",
        sessionId: "s2",
      },
      {
        workspaceId: "ws_2",
        workspaceName: "b",
        workspaceClosed: true,
        terminalId: "t3",
        terminalName: "zsh",
        sessionId: "s3",
      },
    ];

    expect(summarizePtysByWorkspace(entries)).toEqual([
      {
        workspaceName: "a",
        workspaceClosed: false,
        count: 2,
        terminals: ["bash", "claude"],
      },
      {
        workspaceName: "b",
        workspaceClosed: true,
        count: 1,
        terminals: ["zsh"],
      },
    ]);
  });

  it("returns an empty list for no entries", () => {
    expect(summarizePtysByWorkspace([])).toEqual([]);
  });
});

describe("formatPtyEventMessage", () => {
  it("formats without a reason", () => {
    expect(
      formatPtyEventMessage("created", {
        workspaceName: "my-project",
        terminalId: "t1",
        sessionId: "s1",
      }),
    ).toBe('PTY created: session=s1 workspace="my-project" terminal=t1');
  });

  it("appends the reason in parens when present", () => {
    expect(
      formatPtyEventMessage("deleted", {
        workspaceName: "my-project",
        terminalId: "t1",
        sessionId: "s1",
        reason: "workspace reaped",
      }),
    ).toBe(
      'PTY deleted: session=s1 workspace="my-project" terminal=t1 (workspace reaped)',
    );
  });
});

describe("formatPtySummaryMessage", () => {
  function makeEntries(count: number): PtyEntry[] {
    return Array.from({ length: count }, (_, i) => ({
      workspaceId: `ws_${i % 3}`,
      workspaceName: `workspace-${i % 3}`,
      workspaceClosed: false,
      terminalId: `t${i}`,
      terminalName: `term-${i}`,
      sessionId: `s${i}`,
    }));
  }

  it("always emits the per-workspace rollup, regardless of size", () => {
    const entries = makeEntries(50);
    const { message, data } = formatPtySummaryMessage(entries);

    expect(message).toBe(
      "PTY summary: 50 live session(s) across 3 workspace(s)",
    );
    expect(data.workspaces).toHaveLength(3);
    expect(data.workspaces[0]).toEqual({
      workspaceName: "workspace-0",
      workspaceClosed: false,
      count: expect.any(Number),
      terminals: expect.any(Array),
    });
  });

  it("reports zero live sessions cleanly", () => {
    const { message, data } = formatPtySummaryMessage([]);
    expect(message).toBe(
      "PTY summary: 0 live session(s) across 0 workspace(s)",
    );
    expect(data).toEqual({ workspaces: [] });
  });
});
