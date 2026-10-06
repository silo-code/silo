---
status: draft
created: 2026-10-06
---

# 0055. Delegated work in a Chat session

## Summary

Make the work a Chat agent **hands off** — subagents it dispatches, shells it
backgrounds — visible in the Chat panel, matching what the Claude Code CLI shows
for the same session. Today the transcript actively misreports it: a dispatched
subagent's row flips to `completed` the instant the agent backgrounds it, so a
session with twenty minutes of delegated work left looks finished. This proposes
a **delegated-work** model — parsed from the tool-call stream, enriched by the
agent's subagent/task lifecycle where available — rendered as honest transcript
rows plus a tab indicator that distinguishes "the agent is thinking" from "the
agent is done but its delegates are not".

## Motivation

Dave, 2026-10-06, after watching a session badge itself "Finished" while a
subagent ran: _"i'm not seeing any indication of a shell or sub-agent running
and i would like to."_

The turn model is the wrong instrument, deliberately. RFC 0038's turn measures
**the agent thinking**; the **Agent-Initiated Turn** (see
[the glossary](../domain-language.md)) extended it to turns the host never
prompted. Neither covers work the agent dispatched and walked away from — and
for that work the agent genuinely _is_ idle, so reporting `working` would be a
lie that also breaks the attention rule.

The transcript gap is sharper than "missing information". Recorded from a live
session on 2026-10-06:

```jsonc
// the dispatch
{"toolCallId":"toolu_01NJY3G4…","sessionUpdate":"tool_call","title":"Task",
 "kind":"think","_meta":{"claudeCode":{"toolName":"Agent","subagent":true}}}
// …the title streams in as the agent fills its arguments
{"toolCallId":"toolu_01NJY3G4…","title":"Sleep then reply",
 "rawInput":{"description":"Sleep then reply","subagent_type":"general-purpose",
             "run_in_background":true}}
// the hand-off — note `isAsync`
{"_meta":{"claudeCode":{"toolResponse":{"isAsync":true,"status":"async_launched",
  "agentId":"a23be9bfedaa92a67","outputFile":"/private/tmp/…/tasks/…output"}}}}
// …and the row goes grey, 46 seconds before the subagent actually finishes
{"toolCallId":"toolu_01NJY3G4…","status":"completed"}
```

The last two frames are the bug: `status: "completed"` sitting next to
`status: "async_launched"` in the same call. Silo renders the first and never
sees the second, because its tool-call parser drops `_meta` entirely.

The CLI renders that same session as:

```
● Agent(Sleep then report finished)
  └ Backgrounded agent (↓ to manage · ctrl+o to expand)
● launched
✳ Waiting for 1 background agent to finish
● Agent "Sleep then report finished" finished · 46s
```

Every element is derivable from frames Silo already receives — except the last
line. See below.

## What the wire actually gives us (observed, not assumed)

Recorded by a throwaway spike on 2026-10-06 that advertised AIR `asyncTasks` and
replayed two prompts: a backgrounded shell, and an async subagent.

**Available with no capability opt-in, on the ordinary tool-call stream:**

- `_meta.claudeCode.subagent: true` — an explicit marker on the dispatching tool
  call. No inference needed.
- `_meta.claudeCode.toolResponse.isAsync` / `status: "async_launched"` — the
  hand-off, carrying `agentId`, the subagent's `description`, `resolvedModel`,
  and an `outputFile` with `canReadOutputFile: true`.
- `title`, streaming `"Task"` → the agent's own description as `rawInput` fills
  in. This is the CLI's `Agent(<description>)` label.
- Child tool calls stamped with `parentToolUseId` pointing at the dispatch.

**Available only with AIR `asyncTasks`** (`_meta.jetbrains.air`, a vendor
extension with _no_ ACP counterpart at any tier — searched the v1 and
v2-unstable schemas and `docs/acp-coverage.md`):

- `async_task_spawned` / `_progress` / `_state_update`, carrying a name, a
  `taskType`, `canStop: true`, and a `toolCallId` correlating back to the
  transcript row. This is the only source for **backgrounded shells**.

**Not available from either, and this is load-bearing:** nothing reports that a
**subagent finished**. After `async_launched` the dispatching call is never
mentioned again; the parent simply takes an `origin: task-notification` turn and
describes the outcome in prose. The CLI knows because it lives inside the
harness. The protocol-level answer is `subagent_state_update`, gated on either
the canonical ACP `clientCapabilities.subagents` (v1 **unstable** per
`docs/acp-coverage.md`, generated against schema 1.24.1 — **not independently
verified**, and absent from the SDK copy on this machine) or AIR's
`nativeSubagentSessions`, which the adapter's README calls a shim that yields
precedence to the canonical field once released.

Two recorded quirks any implementation must handle: async-task terminal state
arrives **twice** with different values (`stopped` then `completed` — the
adapter keeps a tombstone because the Bash result proving backgrounding can land
after the SDK's terminal edge), and `toolCallId` arrives on a _later_
`async_task_progress`, not at spawn, so the correlation is late-bound.

## Design

### Capabilities

Advertise, on the existing `clientCapabilities` object: AIR
`nativeSubagentSessions` and `asyncTasks`, plus the canonical `subagents` field
once verified. Agents that do not understand `_meta` ignore it — safe by spec,
confirmed against a real agent. Precedence mirrors the adapter's own promise:
canonical wins where present.

### Parsing — a pure module

`chat-delegated-work.ts`, beside `chat-turn-signals.ts` and following the same
shape: wire in, meaning out, no state, tested against the recorded frames. It
owns the vendor quarantine (`_meta.claudeCode`, `_meta.jetbrains.air`) and the
one piece of real logic — **terminal-state precedence**, so `completed`/`failed`
outrank `stopped` and a settled item never regresses.

### Public surface

Two parsed booleans on `AgentToolCall`, rather than exposing raw `_meta`:

```ts
/** This call dispatched a subagent. */
readonly subagent?: boolean;
/** The call reported `completed`, but only handed the work off — it is still
 *  running. Render it live, not settled. */
readonly detached?: boolean;
```

Plus `readonly tasks: readonly AgentTask[]` on `AgentInfo` for backgrounded
shells (id, title, `taskType`, state, `canStop`), so the panel, navigator and
status row read one source instead of each deriving their own.

Deliberately **not** exposed: `outputFile` and `agentId`. A path into the
agent's private temp directory is a capability decision, not a field — Silo
declines the whole `fs/*` prefix today. Revisit when "open the subagent's
output" is a designed feature.

New public surface, so it carries the full `silo-docs-sync` workflow.

### Transcript

Match the CLI, using rows the panel already renders:

- A `subagent` call renders `Agent(<title>)`, with a **Backgrounded agent**
  sub-line once `detached`.
- A `detached` call **does not render as settled**. This is the core fix, and it
  needs no capability.
- Completion renders `Agent "<title>" finished · <duration>` where
  `subagent_state_update` is available. Where it is not, the row stays live and
  resolves on the next `origin: task-notification` turn — exact with one
  outstanding subagent, approximate with several. The degradation shows in the
  wording ("still running") rather than hiding.
- A `Waiting for N background agents to finish` line while any are outstanding.

Backgrounded shells keep `showInTranscript: false` — the agent's own hint — and
appear only in the indicator and count, never as their own row.

### Indicator

Reuse the existing blue rather than add a fifth colour to a vocabulary of four
(working / ready / warn / error):

- **pulsing blue** — the agent is thinking (unchanged)
- **static blue** — the agent is idle, delegated work outstanding
- **green** — everything is done; your turn

Animation becomes the signal for "someone is at the keyboard", stillness for
"delegated and pending". No new token, no legend; the tooltip disambiguates.

### Sound and attention — unchanged, deliberately

Delegated work writes **neither**. Verified behaviourally on 2026-10-06: a
subagent reporting back wakes the agent for a new turn, and the chime already
fires on turn end — so the last chime lands when the last delegate has reported
and the agent has finished speaking. The wanted behaviour falls out of today's
rule with no special case.

This also resolves a collision that would otherwise sink the design.
`needsAttention` has exactly one writer and one rule, and a turn _starting_
deliberately clears it. If delegated work also wrote that flag, a task finishing
would raise the badge and the agent waking to react to that very task would
silently wipe it — the normal sequence, and the notification you most wanted.
Keeping delegated work on the indicator only preserves the single writer.

A rule like "suppress the chime until every delegate finishes" is explicitly
rejected: a long-lived watcher (`crap-engine pr-monitor poll --interval 30`, in
the very session that prompted this work) never terminates, so that session
would never chime at all.

## Alternatives considered

**Infer subagent liveness from `parentToolUseId`.** Workable for the start —
child calls carry their dispatch's id — but indirect: a subagent thinking
without calling tools looks identical to one that finished. Superseded by
`_meta.claudeCode.subagent`, and it does not solve the finish either.

**Ship with no capability opt-in at all.** Tempting, and it does fix the core
bug (the lying row). Rejected as the whole design because it cannot close the
loop — no finish signal, and no backgrounded-shell visibility. Retained as the
documented fallback behaviour.

**Native subagent sessions as addressable ACP sessions.** The richer form: each
subagent its own session with cancel/close. Deferred — it introduces a
nested-session concept (a second `AgentInfo`? a drill-in transcript?) bigger
than this problem needs. This RFC consumes `subagent_state_update` only.

**Render backgrounded shells as transcript rows.** Rejected: the agent says
`showInTranscript: false`, and a long-running shell would pin a stale row.

**Stop support (`canStop`).** Deferred to a follow-on. Every observed task
carried `canStop: true`, but the path was never exercised and the adapter's
`claimStop` / `taskStopped` surface implies an ack the client must model.

## Decision

Open. Three claims here are **unverified** and should be settled before
implementation: that canonical `clientCapabilities.subagents` exists in schema
1.24.1 (read from a generated doc, contradicted by the locally installed SDK's
bundled schema); that `subagent_state_update` carries what the CLI's
"finished · 46s" line needs; and that stopping a task works at all.
