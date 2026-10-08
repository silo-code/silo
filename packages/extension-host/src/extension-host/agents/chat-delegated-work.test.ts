import { describe, it, expect } from "vitest";
import {
  delegatedWorkFacts,
  delegationEvent,
  normalizeSubagentId,
} from "./chat-delegated-work";

/**
 * The frames below are **copied verbatim** out of the committed probe capture
 * `scratchpad/acp-probe/captures/frames-2026-10-06T20-05-31-821Z.jsonl`
 * (`params.update`, 1-based line numbers named per constant) rather than
 * hand-written from the write-up — the whole point of RFC 0055's parser is
 * that it reads what the `claude` binary actually sends, and a literal
 * invented from prose would happily agree with a parser that is wrong.
 *
 * They are copied rather than read off disk at test time on purpose: a unit
 * test must not depend on `scratchpad/` still existing. If the adapter's shape
 * moves, re-probe and replace these — don't adjust them to match the parser.
 */

/** Frame 12 — the dispatch opening. Carries the subagent marker and nothing
 *  about the hand-off; `title` is still the generic `"Task"`. */
const DISPATCH_OPEN = {
  _meta: { claudeCode: { toolName: "Agent", subagent: true } },
  toolCallId: "toolu_017w2qK7W5kVxwtS8365ecQW",
  sessionUpdate: "tool_call",
  rawInput: {},
  status: "pending",
  title: "Task",
  kind: "think",
  content: [],
};

/** Frame 19 — the hand-off. Carries `toolResponse` and **no** `status`. */
const HAND_OFF = {
  _meta: {
    claudeCode: {
      toolResponse: {
        isAsync: true,
        status: "async_launched",
        agentId: "ad21d23b798a69b19",
        description: "Sleep then reply",
        resolvedModel: "claude-opus-5",
        prompt: "Run `sleep 35`, then reply FINISHED.",
        outputFile:
          "/private/tmp/claude-503/.../tasks/ad21d23b798a69b19.output",
        canReadOutputFile: true,
      },
      toolName: "Agent",
    },
  },
  toolCallId: "toolu_017w2qK7W5kVxwtS8365ecQW",
  sessionUpdate: "tool_call_update",
};

/** Frame 20 — the lie. `status: "completed"` with the subagent marker already
 *  gone and no hand-off in sight. */
const DISPATCH_SETTLED = {
  _meta: { claudeCode: { toolName: "Agent" } },
  toolCallId: "toolu_017w2qK7W5kVxwtS8365ecQW",
  sessionUpdate: "tool_call_update",
  status: "completed",
};

/** Frame 26 — a call the subagent made, pointing back at the dispatch. */
const DELEGATED_CALL = {
  _meta: {
    claudeCode: {
      toolName: "Bash",
      title: "Sleep for 35 seconds",
      parentToolUseId: "toolu_017w2qK7W5kVxwtS8365ecQW",
    },
  },
  toolCallId: "toolu_01VwTaeFYn8sVEYQPATUootm",
  sessionUpdate: "tool_call",
  status: "pending",
  title: "sleep 35",
  kind: "execute",
};

/** Frame 28 — a delegated call's own *ordinary* result. `toolResponse` is
 *  present and an object, but says nothing about asynchrony: the real shape
 *  that proves `handedOff` can't just test for `toolResponse`. */
const DELEGATED_CALL_RESULT = {
  _meta: {
    claudeCode: {
      toolResponse: {
        matches: ["Monitor"],
        query: "select:Monitor",
        total_deferred_tools: 46,
      },
      toolName: "ToolSearch",
      parentToolUseId: "toolu_017w2qK7W5kVxwtS8365ecQW",
    },
  },
  toolCallId: "toolu_017bmTHsxcnZV3W2zzzxSpUc",
  sessionUpdate: "tool_call_update",
};

describe("delegatedWorkFacts — the shapes the capture actually carried", () => {
  it("reads the subagent marker off the dispatch's opening frame", () => {
    expect(delegatedWorkFacts(DISPATCH_OPEN)).toEqual({ subagent: true });
  });

  it("reads the hand-off off the frame that carries no status at all", () => {
    // RFC 0057 widened this: the same frame's `toolResponse` already named the
    // worker it handed to (`agentId`) and described the dispatch, and both are
    // now read — the capability-off capture was carrying them all along. The
    // hand-off itself is unchanged, which is what RFC 0055 depended on.
    expect(delegatedWorkFacts(HAND_OFF)).toEqual({
      subagent: true,
      handedOff: true,
      subagentId: "ad21d23b798a69b19",
      title: "Sleep then reply",
    });
  });

  // The crux of RFC 0055: the frame that *says* "completed" carries neither
  // marker, so a per-frame parser can only report nothing here. Making the
  // row correct is the reducer's job, and this is why it has one.
  it("finds nothing on the frame that settles the call to completed", () => {
    expect(delegatedWorkFacts(DISPATCH_SETTLED)).toEqual({});
  });

  it("attributes a delegated call to its dispatch", () => {
    expect(delegatedWorkFacts(DELEGATED_CALL)).toEqual({
      parentToolCallId: "toolu_017w2qK7W5kVxwtS8365ecQW",
    });
  });

  it("does not read an ordinary tool result as a hand-off", () => {
    expect(delegatedWorkFacts(DELEGATED_CALL_RESULT)).toEqual({
      parentToolCallId: "toolu_017w2qK7W5kVxwtS8365ecQW",
    });
  });
});

describe("delegatedWorkFacts — either hand-off signal alone is enough", () => {
  // Requiring both would let one adapter tweak silently disable the whole fix.
  it("accepts isAsync without the status string", () => {
    expect(
      delegatedWorkFacts({ _meta: { claudeCode: { toolResponse: {} } } }),
    ).toEqual({});
    expect(
      delegatedWorkFacts({
        _meta: { claudeCode: { toolResponse: { isAsync: true } } },
      }),
    ).toEqual({ handedOff: true });
  });

  it("accepts the status string without isAsync", () => {
    expect(
      delegatedWorkFacts({
        _meta: { claudeCode: { toolResponse: { status: "async_launched" } } },
      }),
    ).toEqual({ handedOff: true });
  });

  it("ignores a toolResponse whose status is some other string", () => {
    expect(
      delegatedWorkFacts({
        _meta: { claudeCode: { toolResponse: { status: "completed" } } },
      }),
    ).toEqual({});
  });
});

describe("delegatedWorkFacts — an unrecognised shape degrades to absence", () => {
  // R5's table, case for case. The vendor fields this reads are versioned by
  // nothing, so "the adapter changed shape" has to land as today's rendering
  // and never as a throw or a half-applied marking.
  const unrecognised: readonly [string, unknown][] = [
    ["undefined", undefined],
    ["null", null],
    ["a string", "tool_call"],
    ["a number", 7],
    ["an array", [{ subagent: true }]],
    ["no _meta at all", { toolCallId: "c1", status: "completed" }],
    ["_meta null", { _meta: null }],
    ["_meta a string", { _meta: "claudeCode" }],
    ["_meta an array", { _meta: [{ claudeCode: { subagent: true } }] }],
    ["claudeCode null", { _meta: { claudeCode: null } }],
    ["claudeCode a string", { _meta: { claudeCode: "subagent" } }],
    ["claudeCode an array", { _meta: { claudeCode: [{ subagent: true }] } }],
    ["another vendor's _meta", { _meta: { "_claude/rateLimit": {} } }],
    [
      "toolResponse a string",
      { _meta: { claudeCode: { toolResponse: "ok" } } },
    ],
    [
      "toolResponse an array",
      { _meta: { claudeCode: { toolResponse: [{ isAsync: true }] } } },
    ],
    ["toolResponse null", { _meta: { claudeCode: { toolResponse: null } } }],
    ["toolResponse a number", { _meta: { claudeCode: { toolResponse: 1 } } }],
  ];

  for (const [label, input] of unrecognised) {
    it(`yields all three facts absent for ${label}`, () => {
      expect(() => delegatedWorkFacts(input)).not.toThrow();
      const facts = delegatedWorkFacts(input);
      expect(facts).toEqual({});
      expect("subagent" in facts).toBe(false);
      expect("handedOff" in facts).toBe(false);
      expect("parentToolCallId" in facts).toBe(false);
    });
  }

  // `subagent` present but not `true` is treated as absent rather than
  // falsy-coerced: the marker is an explicit claim, and anything else is the
  // adapter saying something this parser doesn't understand.
  it.each([false, 1, 0, "true", null, {}])(
    "treats subagent: %o as absent, not as a value",
    (value) => {
      const facts = delegatedWorkFacts({
        _meta: { claudeCode: { subagent: value } },
      });
      expect(facts).toEqual({});
      expect("subagent" in facts).toBe(false);
    },
  );

  it.each([["", "empty"] as const, [42, "a number"] as const])(
    "omits parentToolCallId when parentToolUseId is %s",
    (value) => {
      const facts = delegatedWorkFacts({
        _meta: { claudeCode: { parentToolUseId: value } },
      });
      expect(facts).toEqual({});
      expect("parentToolCallId" in facts).toBe(false);
    },
  );
});

describe("delegatedWorkFacts — the facts are independent", () => {
  // Nothing on the wire pairs them, and a future adapter could send any
  // combination. A dispatch *is* also a delegated call when a subagent
  // dispatches its own subagent.
  it("reads all three off one frame when all three are present", () => {
    expect(
      delegatedWorkFacts({
        _meta: {
          claudeCode: {
            subagent: true,
            toolResponse: { isAsync: true },
            parentToolUseId: "parent-1",
          },
        },
      }),
    ).toEqual({
      subagent: true,
      handedOff: true,
      parentToolCallId: "parent-1",
    });
  });
});

/**
 * RFC 0057's fixtures come from a **second** committed capture —
 * `scratchpad/acp-probe/captures/frames-cap-air-bg-2026-10-07T19-35-21-238Z.jsonl`,
 * taken with AIR `nativeSubagentSessions` advertised. Same discipline as
 * above: copied verbatim from `params.update`, never invented from prose.
 *
 * The regime change the capability makes is the thing worth seeing in these
 * literals: there is **no opening `tool_call`** for the dispatch and **no
 * `_meta.claudeCode.subagent` marker** anywhere. The dispatch arrives as a
 * lone `tool_call_update` whose `toolResponse` names the worker — which is why
 * the parser reads `agentId` as a second source for "this is a dispatch".
 */

/** The dispatch, capability-on. No `title`, no `status`, no subagent marker. */
const CAP_DISPATCH = {
  _meta: {
    claudeCode: {
      toolResponse: {
        isAsync: true,
        status: "async_launched",
        agentId: "a26fef4c40ae0ac1d",
        description: "Background sleep task",
        resolvedModel: "claude-haiku-4-5-20251001",
        prompt: "Run `sleep 30`, then reply FINISHED.",
        canReadOutputFile: true,
      },
      toolName: "Agent",
    },
  },
  toolCallId: "toolu_01UVpzoKuVLPGTXMKH7i2Puz",
  sessionUpdate: "tool_call_update",
};

/** The worker announcing itself, on the **parent's** session id. */
const SPAWNED = {
  sessionUpdate: "subagent_spawned",
  subagentSessionId: "a26fef4c40ae0ac1d",
  name: "Background sleep task",
  task: "Run `sleep 30`, then reply FINISHED.",
  capabilities: {},
};

/** The finish — observed 25s after the parent's turn had already ended. */
const COMPLETED = {
  sessionUpdate: "subagent_state_update",
  subagentSessionId: "a26fef4c40ae0ac1d",
  state: "completed",
};

/** The **second** announcement of the same worker, generation-suffixed. */
const SPAWNED_GEN2 = {
  sessionUpdate: "subagent_spawned",
  subagentSessionId: "a26fef4c40ae0ac1d:generation:2",
  name: "Background sleep task",
  task: "<task-notification>…</task-notification>",
};

describe("normalizeSubagentId", () => {
  // The capture shows the lifecycle pair arriving twice per worker, the second
  // time generation-suffixed. Collapsing them at parse time is what lets every
  // consumer get away with plain last-write-wins (RFC 0057 R5).
  it("collapses a generation suffix onto the base id", () => {
    expect(normalizeSubagentId("a26fef4c40ae0ac1d:generation:2")).toBe(
      "a26fef4c40ae0ac1d",
    );
  });

  it("leaves an un-suffixed id alone", () => {
    // Which is also the child session id the worker's own frames arrive on, so
    // normalising makes the join one string in both places.
    expect(normalizeSubagentId("a26fef4c40ae0ac1d")).toBe("a26fef4c40ae0ac1d");
  });

  it("collapses any generation number, not just 2", () => {
    expect(normalizeSubagentId("w:generation:17")).toBe("w");
  });

  it("leaves a lookalike that is not the suffix alone", () => {
    expect(normalizeSubagentId("generation:2")).toBe("generation:2");
    expect(normalizeSubagentId("w-generation-2")).toBe("w-generation-2");
  });
});

describe("delegationEvent — the subagent lifecycle", () => {
  it("reads the announcement, with the worker's name and task", () => {
    expect(delegationEvent(SPAWNED)).toEqual({
      subagentId: "a26fef4c40ae0ac1d",
      name: "Background sleep task",
      task: "Run `sleep 30`, then reply FINISHED.",
      state: "started",
    });
  });

  it("reads the terminal state", () => {
    expect(delegationEvent(COMPLETED)).toEqual({
      subagentId: "a26fef4c40ae0ac1d",
      state: "completed",
    });
  });

  it("gives the repeat announcement the same identity as the first", () => {
    // One worker reported twice must count as one — the specific way a naive
    // consumer would never reach zero outstanding.
    expect(delegationEvent(SPAWNED_GEN2)?.subagentId).toBe(
      delegationEvent(SPAWNED)?.subagentId,
    );
  });

  it.each(["completed", "failed", "cancelled", "disconnected"])(
    "accepts the terminal state %s",
    (state) => {
      expect(delegationEvent({ ...COMPLETED, state })?.state).toBe(state);
    },
  );

  it.each(["running", "STARTED", "done", "", "started"])(
    "yields nothing for the unrecognised state %o rather than guessing",
    (state) => {
      // A guess here is how a transcript starts lying: "I don't know" must not
      // be rendered as a finish. (`"started"` is excluded on purpose — it is
      // this module's reading of an *announcement*, never a reported state.)
      expect(delegationEvent({ ...COMPLETED, state })).toBeUndefined();
    },
  );

  it("yields nothing for a state that is not a string", () => {
    for (const state of [1, null, true, {}, ["completed"]]) {
      expect(delegationEvent({ ...COMPLETED, state })).toBeUndefined();
    }
  });

  it.each([
    ["an unrelated kind", { sessionUpdate: "agent_message_chunk" }],
    ["a tool call", { sessionUpdate: "tool_call", toolCallId: "t1" }],
    ["a missing id", { sessionUpdate: "subagent_spawned" }],
    [
      "an empty id",
      { sessionUpdate: "subagent_spawned", subagentSessionId: "" },
    ],
    [
      "a non-string id",
      { sessionUpdate: "subagent_spawned", subagentSessionId: 7 },
    ],
    [
      "an id that is only a generation suffix",
      {
        sessionUpdate: "subagent_spawned",
        subagentSessionId: ":generation:2",
      },
    ],
  ])("yields nothing for %s", (_label, frame) => {
    expect(delegationEvent(frame)).toBeUndefined();
  });

  it.each([undefined, null, "subagent_spawned", 7, [SPAWNED]])(
    "returns undefined rather than throwing for %o",
    (input) => {
      expect(delegationEvent(input)).toBeUndefined();
    },
  );

  it("omits a name or task the wire did not carry", () => {
    const event = delegationEvent({
      sessionUpdate: "subagent_spawned",
      subagentSessionId: "w1",
      name: 7,
    });
    expect(event).toEqual({ subagentId: "w1", state: "started" });
    expect(event && "name" in event).toBe(false);
  });
});

describe("delegatedWorkFacts — the capability-on regime", () => {
  // The regime RFC 0055 predicted and RFC 0057 confirmed: no opening
  // `tool_call`, no `subagent` marker, the dispatch arriving as one
  // `tool_call_update`. Without re-sourcing, this frame would produce a row
  // that is not recognisably a dispatch and has no name.
  it("reads a dispatch with no marker from the worker it handed to", () => {
    expect(delegatedWorkFacts(CAP_DISPATCH)).toEqual({
      subagent: true,
      handedOff: true,
      subagentId: "a26fef4c40ae0ac1d",
      title: "Background sleep task",
    });
  });

  it("normalises the agentId the same way the lifecycle id is normalised", () => {
    // Both sides of the join go through one helper, so a generation suffix on
    // either cannot break the match.
    expect(
      delegatedWorkFacts({
        _meta: {
          claudeCode: {
            toolResponse: { agentId: "a26fef4c40ae0ac1d:generation:2" },
          },
        },
      }).subagentId,
    ).toBe("a26fef4c40ae0ac1d");
  });

  it("keeps parentToolCallId working under this regime too", () => {
    // Every child frame in the capability-on capture carries it, pointing at
    // the dispatch — RFC 0055's grouping is unchanged, which is the whole
    // claim of ADR 0056 point 3.
    expect(
      delegatedWorkFacts({
        _meta: {
          claudeCode: {
            toolName: "Bash",
            parentToolUseId: "toolu_01UVpzoKuVLPGTXMKH7i2Puz",
          },
        },
      }),
    ).toEqual({ parentToolCallId: "toolu_01UVpzoKuVLPGTXMKH7i2Puz" });
  });

  it.each([
    ["absent", {}],
    ["empty", { agentId: "" }],
    ["a number", { agentId: 7 }],
    ["null", { agentId: null }],
  ])(
    "omits subagentId and infers no dispatch when agentId is %s",
    (_l, resp) => {
      const facts = delegatedWorkFacts({
        _meta: { claudeCode: { toolResponse: resp } },
      });
      expect("subagentId" in facts).toBe(false);
      expect("subagent" in facts).toBe(false);
    },
  );

  it.each([
    ["absent", {}],
    ["empty", { description: "" }],
    ["a number", { description: 7 }],
  ])("omits the title when description is %s", (_l, resp) => {
    const facts = delegatedWorkFacts({
      _meta: { claudeCode: { toolResponse: resp } },
    });
    expect("title" in facts).toBe(false);
  });

  it.each([null, "async_launched", 7, ["agentId"]])(
    "degrades to absence when toolResponse is %o",
    (toolResponse) => {
      // The degradation path *is* the error path: an unrecognised shape yields
      // nothing and the row renders as it did before the capability existed.
      expect(
        delegatedWorkFacts({ _meta: { claudeCode: { toolResponse } } }),
      ).toEqual({});
    },
  );
});
