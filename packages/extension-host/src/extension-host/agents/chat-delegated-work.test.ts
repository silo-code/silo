import { describe, it, expect } from "vitest";
import { delegatedWorkFacts } from "./chat-delegated-work";

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
    expect(delegatedWorkFacts(HAND_OFF)).toEqual({ handedOff: true });
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
