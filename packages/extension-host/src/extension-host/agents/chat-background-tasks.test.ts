import { describe, it, expect } from "vitest";
import {
  backgroundTaskEvent,
  backgroundedToolCallFact,
  isTerminalBackgroundTaskState,
} from "./chat-background-tasks";

/**
 * The frames below are **copied verbatim** out of the committed probe capture
 * `scratchpad/acp-probe/captures/frames-bgshell-2026-10-08T21-00-50-385Z.jsonl`
 * (`params.update`, 1-based line numbers named per constant) rather than
 * hand-written from RFC 0058 — the whole point of the parser is that it reads
 * what the `claude` binary actually sends, and a literal invented from prose
 * would happily agree with a parser that is wrong.
 *
 * They are copied rather than read off disk at test time on purpose: a unit
 * test must not depend on `scratchpad/` still existing. If the adapter's shape
 * moves, re-probe and replace these — don't adjust them to match the parser.
 *
 * `outputFilePath` is kept on the frames that carried it even though nothing
 * reads it, so the fixtures stay honest about what arrives.
 */

const TASK = "bp9m0jkzd";
const CALL = "toolu_012TVzXJk9LrTopLfEkZhmhx";
const OUTPUT_FILE =
  "/private/tmp/claude-503/-private-var-folders-bz-wnsmxdxj32vc7-b986wx1k500000gq-T-acp-bg-shell-55R1h3/f2e3b8ae-4e13-4f02-87e8-57aea63b31ee/tasks/bp9m0jkzd.output";

/** Line 18 — the announcement. Names the command and says it can be stopped,
 *  and carries **no `toolCallId`**: this is the frame a consumer keyed on the
 *  tool call would lose. */
const SPAWNED = {
  sessionUpdate: "async_task_spawned",
  asyncTaskId: TASK,
  name: "Background probe shell command",
  taskType: "shell",
  description: "Background probe shell command",
  showInTranscript: false,
  canStop: true,
};

/** Line 19 — the correlation, 1ms after the announcement and carrying nothing
 *  but the join. */
const PROGRESS_CORRELATION = {
  sessionUpdate: "async_task_progress",
  asyncTaskId: TASK,
  toolCallId: CALL,
};

/** Line 21 — a second progress frame, adding only the log path. */
const PROGRESS_OUTPUT_FILE = {
  sessionUpdate: "async_task_progress",
  asyncTaskId: TASK,
  outputFilePath: OUTPUT_FILE,
  toolCallId: CALL,
};

/** Line 29 — the **best-effort** terminal state, 24s after the turn ended. */
const STATE_STOPPED = {
  sessionUpdate: "async_task_state_update",
  asyncTaskId: TASK,
  state: "stopped",
  outputFilePath: OUTPUT_FILE,
  toolCallId: CALL,
};

/** Line 30 — the authoritative terminal state, in the same millisecond as
 *  line 29 and contradicting it. The command succeeded. */
const STATE_COMPLETED = {
  sessionUpdate: "async_task_state_update",
  asyncTaskId: TASK,
  state: "completed",
  outputFilePath: OUTPUT_FILE,
  toolCallId: CALL,
};

/** Line 22 — the `Bash` call settling. The marker and the lie ride the **same
 *  frame**: `status: "completed"` for a command with 29s left to run. */
const CALL_BACKGROUNDED = {
  _meta: {
    claudeCode: { toolName: "Bash" },
    jetbrains: { air: { version: 1, asyncTasks: { backgrounded: true } } },
  },
  toolCallId: CALL,
  sessionUpdate: "tool_call_update",
  status: "completed",
};

/** Line 20 — the frame before it. `toolResponse.backgroundTaskId` is the only
 *  hint here and it is **not** the marker; this frame must read as unmarked. */
const CALL_WITH_TASK_ID = {
  _meta: {
    claudeCode: {
      toolResponse: { stdout: "", stderr: "", backgroundTaskId: TASK },
      toolName: "Bash",
    },
  },
  toolCallId: CALL,
  sessionUpdate: "tool_call_update",
};

describe("backgroundTaskEvent", () => {
  it("reads the announcement, including the fields only it carries", () => {
    expect(backgroundTaskEvent(SPAWNED)).toEqual({
      asyncTaskId: TASK,
      state: "running",
      name: "Background probe shell command",
      taskType: "shell",
      canStop: true,
    });
  });

  it("gives the announcement no toolCallId, because the wire doesn't", () => {
    // The capture's spawn carries none; correlation arrives separately. If this
    // ever starts failing the adapter changed, and the reducer's accumulation
    // can be simplified.
    expect(backgroundTaskEvent(SPAWNED)?.toolCallId).toBeUndefined();
  });

  it("reads the correlation frame as metadata with NO state", () => {
    // The load-bearing assertion of this file. A progress frame asserting
    // `"running"` would resurrect a finished command, because the agent
    // publishes from terminal tombstones.
    const event = backgroundTaskEvent(PROGRESS_CORRELATION);
    expect(event).toEqual({ asyncTaskId: TASK, toolCallId: CALL });
    expect(event?.state).toBeUndefined();
  });

  it("reads both terminal states, each at face value", () => {
    // The parser reports what the frame said and does not arbitrate; choosing
    // between `stopped` and `completed` is the reducer's rule, so that it can
    // be tested as the ordering problem it is.
    expect(backgroundTaskEvent(STATE_STOPPED)).toEqual({
      asyncTaskId: TASK,
      state: "stopped",
      toolCallId: CALL,
    });
    expect(backgroundTaskEvent(STATE_COMPLETED)).toEqual({
      asyncTaskId: TASK,
      state: "completed",
      toolCallId: CALL,
    });
  });

  it("does not leak outputFilePath, which is a capability decision", () => {
    // A path into the agent's private temp directory, deliberately unexposed —
    // the same call RFC 0055 made about `agentId` and `outputFile`.
    for (const frame of [
      PROGRESS_OUTPUT_FILE,
      STATE_STOPPED,
      STATE_COMPLETED,
    ]) {
      expect(JSON.stringify(backgroundTaskEvent(frame))).not.toContain("tasks");
    }
  });

  it("drops a progress frame carrying nothing a consumer can use", () => {
    // Only an id: no correlation, no summary. An event for it would make the
    // reducer rebuild its map for no change.
    expect(
      backgroundTaskEvent({
        sessionUpdate: "async_task_progress",
        asyncTaskId: TASK,
      }),
    ).toBeUndefined();
    // …but one carrying only the log path is also useless to us, for the same
    // reason, since the path isn't exposed.
    expect(
      backgroundTaskEvent({
        sessionUpdate: "async_task_progress",
        asyncTaskId: TASK,
        outputFilePath: OUTPUT_FILE,
      }),
    ).toBeUndefined();
  });

  it("carries a terminal summary through when the agent sends one", () => {
    expect(
      backgroundTaskEvent({ ...STATE_COMPLETED, summary: "exit 0" })?.summary,
    ).toBe("exit 0");
  });

  it("reads a state outside the closed set as no event at all", () => {
    // Guessing what an unknown state means is how a transcript starts lying;
    // absence degrades to the pre-RFC-0058 rendering instead.
    for (const state of ["queued", "weird", "", 7, null, {}]) {
      expect(
        backgroundTaskEvent({ ...STATE_COMPLETED, state }),
      ).toBeUndefined();
    }
  });

  it("ignores every other session update kind", () => {
    for (const sessionUpdate of [
      "tool_call",
      "tool_call_update",
      "subagent_spawned",
      "subagent_state_update",
      "agent_message_chunk",
      "usage_update",
    ]) {
      expect(
        backgroundTaskEvent({
          sessionUpdate,
          asyncTaskId: TASK,
          state: "running",
        }),
      ).toBeUndefined();
    }
  });

  it("is total — never throws, for any input", () => {
    for (const input of [
      undefined,
      null,
      7,
      "async_task_spawned",
      [],
      {},
      { sessionUpdate: "async_task_spawned" },
      { sessionUpdate: "async_task_spawned", asyncTaskId: "" },
      { sessionUpdate: "async_task_spawned", asyncTaskId: 7 },
      { sessionUpdate: "async_task_state_update", asyncTaskId: TASK },
    ]) {
      expect(() => backgroundTaskEvent(input)).not.toThrow();
      expect(backgroundTaskEvent(input)).toBeUndefined();
    }
  });

  it("omits a blank toolCallId rather than carrying an unusable join", () => {
    expect(
      backgroundTaskEvent({ ...STATE_COMPLETED, toolCallId: "" })?.toolCallId,
    ).toBeUndefined();
  });
});

describe("backgroundedToolCallFact", () => {
  it("reads the marker off the frame that carries it", () => {
    expect(backgroundedToolCallFact(CALL_BACKGROUNDED)).toBe(true);
  });

  it("confirms that frame is also the one telling the lie", () => {
    // Not about the parser — about the capture. If this ever stops holding, the
    // adapter stopped settling a backgrounded call to `completed` and the whole
    // feature is unnecessary.
    expect(CALL_BACKGROUNDED.status).toBe("completed");
  });

  it("does not read backgroundTaskId as the marker", () => {
    // That field rides the capability-free stream too, so inferring from it
    // would claim a resolvable row on a session that gets no lifecycle —
    // a row stuck on "running in background" forever (RFC 0058 alternatives).
    expect(backgroundedToolCallFact(CALL_WITH_TASK_ID)).toBeUndefined();
  });

  it("requires exactly true, and omits rather than returning false", () => {
    // Omission is what lets the reducer treat "this frame didn't say" as
    // "unchanged" — the marker rides one frame and later ones don't repeat it.
    for (const backgrounded of [false, 1, "true", null, {}, undefined]) {
      expect(
        backgroundedToolCallFact({
          _meta: { jetbrains: { air: { asyncTasks: { backgrounded } } } },
        }),
      ).toBeUndefined();
    }
  });

  it("ignores a marker in the claudeCode namespace", () => {
    // The namespace is the capability contract, not decoration: AIR means
    // "you advertised and will get the lifecycle".
    expect(
      backgroundedToolCallFact({
        _meta: { claudeCode: { asyncTasks: { backgrounded: true } } },
      }),
    ).toBeUndefined();
  });

  it("is total — never throws, for any input", () => {
    for (const input of [
      undefined,
      null,
      7,
      "x",
      [],
      {},
      { _meta: null },
      { _meta: "air" },
      { _meta: { jetbrains: 7 } },
      { _meta: { jetbrains: { air: null } } },
      { _meta: { jetbrains: { air: { asyncTasks: "yes" } } } },
      { _meta: { jetbrains: { air: { asyncTasks: [] } } } },
    ]) {
      expect(() => backgroundedToolCallFact(input)).not.toThrow();
      expect(backgroundedToolCallFact(input)).toBeUndefined();
    }
  });
});

describe("isTerminalBackgroundTaskState", () => {
  it("names the three terminal states and the two live ones", () => {
    expect(isTerminalBackgroundTaskState("completed")).toBe(true);
    expect(isTerminalBackgroundTaskState("failed")).toBe(true);
    expect(isTerminalBackgroundTaskState("stopped")).toBe(true);
    expect(isTerminalBackgroundTaskState("running")).toBe(false);
    expect(isTerminalBackgroundTaskState("paused")).toBe(false);
  });
});
