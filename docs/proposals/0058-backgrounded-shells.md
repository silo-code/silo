---
status: implemented
created: 2026-10-08
---

# 0058. Backgrounded shells in a Chat session

> **Implemented in full; one capability deliberately left unbuilt.** Everything
> this RFC scoped shipped — the row tells the truth, resolves on its own, and
> the panel counts running shells. A **stop control** is reachable on the same
> capability (`canStop`, `_session/async_task/stop`) and was never in scope
> here: it is a _write_ to the agent, where all of this is read-only rendering.
> It is not urgent, because asking the agent to stop the command works today.
> See "Follow-ons" — which also records that **none of these are tracked
> anywhere else.**

## Summary

When a Chat agent backgrounds a shell command, the transcript says the command
is **done** while it is still running — the same lie [RFC 0055](./0055-chat-async-tasks.md)
fixed for subagent dispatches, on the other half of the feature Dave originally
asked for. The `Bash` card settles `status: "completed"` the moment the command
detaches, and a `sleep 30` reads as finished at second one.

This proposal makes that row tell the truth and, unlike the subagent case,
**resolve**: the adapter reports a terminal state per backgrounded command, so
the row goes from running-in-background to completed/failed/stopped on its own,
and the panel can show a count of running shells that comes _down_.

Nothing moves on the host ↔ extension boundary beyond one optional field on the
public `AgentToolCall` (`backgrounded`) and one new modelled update field
(`AgentSessionUpdate.backgroundTask`). The one genuinely new thing is that Silo
**advertises a second AIR capability** (`asyncTasks`) — the first was
`nativeSubagentSessions` in RFC 0057, and [ADR 0057](../decisions/0057-advertising-a-vendor-protocol-extension.md)
is the standing rule this is now the second instance of.

## Motivation

Dave, 2026-10-06: _"i'm not seeing any indication of a shell or sub-agent
running and i would like to."_ RFC 0055 and RFC 0057 shipped the sub-agent half.
This is the shell half, and it is the smaller of the two: no session routing is
involved.

RFC 0055 closed with this as its last open item, and corrected an earlier draft
that had claimed it was blocked:

> **Backgrounded shells are unblocked, and were never part of this.** An earlier
> draft claimed they were blocked on the same two facts; that was **wrong**.

## What the wire gives us

Verified against the pinned adapter (`claude-agent-acp@0.75.1`) and the
**committed capture**
`scratchpad/acp-probe/captures/frames-cap-air-bg-2026-10-07T19-35-21-238Z.jsonl`,
not against a write-up — the rule RFC 0055 earned the hard way, after three
documented claims about this adapter turned out wrong when actually run.

A backgrounded shell produces **two parallel streams on one call id**, and the
design turns on their being separate:

### The tool call — marked, and still lying

| Frame | `status`    | `_meta`                                                                             |
| ----- | ----------- | ----------------------------------------------------------------------------------- |
| 1     | `pending`   | `claudeCode: {toolName: "Bash", title: "Sleep for 30 seconds"}`                     |
| 2     | _absent_    | `claudeCode: {toolResponse: {…, backgroundTaskId: "bcylisuap"}}`                    |
| 3     | `completed` | `claudeCode: {toolName: "Bash"}`, **`jetbrains.air.asyncTasks.backgrounded: true`** |

Frame 3 is the whole point: the status is `completed` and the command has 29
seconds left to run. The adapter's own source comment says so outright —

> A backgrounded Bash call returns as soon as the command is handed off, so the
> card reaches `completed` while the command itself runs on for minutes. ACP has
> no tool-call status for "still running elsewhere", so this marker is what lets
> a client render the card as backgrounded work instead of finished work.

Note the marker is in the **`jetbrains.air`** namespace, not `claudeCode`, and
that placement is deliberate on the adapter's part: it is only stamped for a
client that advertised `asyncTasks`, because to a client that did not — and is
therefore never sent the lifecycle below — the marker would promise a card state
it could never resolve. **The marker and the lifecycle are one capability; take
both or neither.**

### The async-task lifecycle — the part that resolves

```jsonc
{"sessionUpdate":"async_task_spawned","asyncTaskId":"bcylisuap","name":"Sleep for 30 seconds",
 "taskType":"shell","description":"Sleep for 30 seconds","showInTranscript":false,"canStop":true}
{"sessionUpdate":"async_task_progress","asyncTaskId":"bcylisuap","toolCallId":"toolu_01YQ…"}
{"sessionUpdate":"async_task_progress","asyncTaskId":"bcylisuap","outputFilePath":"…","toolCallId":"toolu_01YQ…"}
{"sessionUpdate":"async_task_state_update","asyncTaskId":"bcylisuap","state":"stopped","toolCallId":"toolu_01YQ…"}
{"sessionUpdate":"async_task_state_update","asyncTaskId":"bcylisuap","state":"completed","toolCallId":"toolu_01YQ…"}
```

Five consequences a future change must preserve:

1. **There is a terminal state, and it is identified.** `state: "completed"`
   keyed by `asyncTaskId`, correlated to `toolCallId`. This is exactly what the
   subagent stream could not give RFC 0055, and it is why this row resolves and
   a dispatch row does not.
2. **The terminal state arrives TWICE and the first one is wrong.** `stopped`
   then `completed`, 1ms apart. Not a glitch — `finish()` in the adapter's
   `async-tasks.js` documents it: _"A level event may precede the authoritative
   terminal edge. Correct its best-effort stopped state if that edge later
   arrives."_ A reducer that latches the first terminal renders a successful
   command as **stopped**, which reads as "something killed it". Last terminal
   wins; the adapter permits this correction in one direction only
   (`level` → `event`), so there is no oscillation to defend against.
3. **`async_task_spawned` carries no `toolCallId`.** The correlation arrives on
   the first `async_task_progress`, 1ms later. So `asyncTaskId` is the primary
   key and the tool-call link is _learned_ — a consumer keyed on `toolCallId`
   alone drops the spawn, including the `name`, `canStop` and `taskType` that
   only the spawn carries.
4. **`showInTranscript: false`.** The adapter is telling the client not to give
   this task a transcript row of its own — which is the right answer, because the
   `Bash` card already is that row. This is the adapter agreeing with the design
   below rather than a constraint on it.
5. **`canStop: true`**, and the adapter exposes `_session/async_task/stop`
   taking `{sessionId, asyncTaskId}`. A stop control is reachable — see
   "Follow-ons". These two facts are why that is scoped work rather than a
   research question.

### Ordering, and the one thing the committed capture cannot settle

That capture is of a shell backgrounded **inside a subagent**, which is the one
case where the correlation is cross-session: the `Bash` call arrived on the child
session while the lifecycle was published on the **root**, because
`AsyncTaskRuntime` is constructed once per `session/new`. The case Silo has to
render is a shell in the session the user is looking at, so
`scratchpad/acp-probe/background-shell-2026-10-08.mjs` probes that directly.

Its run is committed as
`captures/frames-bgshell-2026-10-08T21-00-50-385Z.jsonl` (+ `report-…json`), and
every point above survived in the main session:

| Question                                | Answer                                                               |
| --------------------------------------- | -------------------------------------------------------------------- |
| Marker on the main-session `Bash` call? | **Yes** — one frame, carrying `status: "completed"` (the lie)        |
| One session for call and lifecycle?     | **Yes** — no routing prerequisite                                    |
| Turn ends before the command does?      | **Yes** — turn end `+23.0s`, terminal state `+46.9s`                 |
| Double terminal reproduced?             | **Yes** — `stopped` → `completed`, latching the first would be wrong |
| Does the spawn carry `toolCallId`?      | **No** — correlation first arrives on `async_task_progress`          |

**The 24-second gap is the finding that shapes the UI.** The turn ends, the
session reads idle, and the command runs on — so an indicator gated on
`AgentInfo.activity` would hide exactly when it is needed. RFC 0057 made that
mistake on the subagent line and had to undo it; here the capture says up front
that the quiet window is not an edge case but the normal shape of the feature.
(The same capture shows the agent opening a notification turn at `+50.5s` to
report the result, ~3.6s after the terminal state — so the state update, not the
agent's prose, is the timely signal.)

## Proposed change

### Advertise `asyncTasks` — the second AIR instance

`AIR_CLIENT_META` (`acp-jsonrpc.ts`) gains `"asyncTasks"` beside
`"nativeSubagentSessions"`. Its doc comment currently says, correctly for today:

> `"asyncTasks"` is **not** advertised. It is the out-of-scope sibling
> (backgrounded shells), and advertising a capability whose frames nothing
> consumes would put `async_task_*` updates on the stream for no reader.

This proposal supplies the reader, which is the condition that comment set. ADR
0057's rules carry over unchanged and are not re-litigated: the block goes
**inside `initialize`'s `clientCapabilities`** (the adapter reads AIR from
nowhere else, and a correctly-shaped block in the wrong place is silently
capability-off), and the unit test asserts the opt-in by running the adapter's
own gate — because a silently-failed opt-in is indistinguishable from an agent
that doesn't speak the extension.

### One new quarantine module

`chat-background-tasks.ts`, beside `chat-delegated-work.ts` and the same shape:
wire in, meaning out, no state, no React. ADR 0056 says **one quarantine module
per feature**, and backgrounded shells are a different feature from delegated
agent work — so this is a sibling, not an addition to `chat-delegated-work.ts`.

- `backgroundTaskEvent(update)` reads the three `async_task_*` kinds into a
  modelled event. An unknown `state`, a missing `asyncTaskId`, or any other kind
  yields `undefined` rather than a guess.
- `backgroundedToolCallFact(update)` reads
  `_meta.jetbrains.air.asyncTasks.backgrounded === true` — nothing weaker — off a
  tool-call frame.

Degradation is the error path, as ever: an unrecognised shape yields absence,
which is byte-for-byte today's rendering.

### Public surface — one tool-call fact, one update field

```ts
// AgentToolCall
readonly backgrounded?: boolean;   // this call's command detached; the status is about the hand-off

// AgentSessionUpdate
readonly backgroundTask?: AgentBackgroundTask;
```

`backgrounded` is a **durable fact about one frame**, accumulated by the reducer
exactly as `subagent` and `handedOff` are.

It is deliberately **its own field rather than reuse of `handedOff`**, despite
`handedOff`'s doc comment predicting that "a backgrounded shell is the next thing
expected to set it". Two reasons, and the first is decisive: on the wire a
backgrounded Bash sets **neither** `isAsync` nor `async_launched`, so it does not
in fact trip `handedOff`'s gate — the prediction is not borne out. And
semantically the two differ in the way that matters most to a UI: `handedOff`
means "nobody will ever tell us how this ended", while `backgrounded` means "a
terminal state is coming". Collapsing them would force every consumer to re-split
them to render either one honestly.

`AgentBackgroundTask` mirrors `AgentDelegation`'s shape and documented caveats:

```ts
export type AgentBackgroundTaskState =
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "stopped";

export interface AgentBackgroundTask {
  readonly asyncTaskId: string; // the primary key; stable for the task's life
  readonly state: AgentBackgroundTaskState;
  readonly toolCallId?: string; // learned, not given on spawn
  readonly name?: string; // spawn-only — accumulate
  readonly taskType?: string; // spawn-only, e.g. "shell"
  readonly canStop?: boolean; // spawn-only
  readonly summary?: string;
}
```

`outputFilePath` is on the wire and **deliberately not exposed**: a path into the
agent's private temp directory is a capability decision, not a field — the same
call RFC 0055 made about `agentId` and `outputFile`.

### Transcript model

`ToolEntry` gains `backgrounded`, accumulated under the existing
"undefined means unchanged" rule. `Transcript` gains:

```ts
readonly backgroundTasks: ReadonlyMap<string, BackgroundTaskEntry>;
```

keyed by `asyncTaskId` — the exact parallel to RFC 0057's `delegations`, and for
the same stated reason: an entry is a row of history, while this is the current
state of work that outlives the turn that started it. Two rules the capture
forces:

- **Last terminal wins** (consequence 2 above). The map accumulates `name` /
  `taskType` / `canStop` from the spawn and `toolCallId` from whichever frame
  first carries it, so a row can be found from a task and a task from a row.
- **`closeDanglingTools` must not settle a backgrounded row.** A handed-off row
  needed no change there because it was already `completed`; a backgrounded row
  is too, so the same reasoning holds — but it now needs a comment of its own,
  because the sweep is exactly where a future change would break this.

### Rendering — tier 1

The `Bash` row stops claiming it finished, and gains a state that resolves:

- **While running** — a `running in background` badge, and the row reads as
  live. Unlike the handed-off dispatch, `isToolRunning` **is** widened here: the
  `WaveText` ripple means "this call is running", and for a backgrounded shell
  that is simply true. This is the opposite call from RFC 0055's, and the
  difference is the terminal signal: the ripple is honest precisely because
  something will come along and stop it.
- **Once terminal** — the badge resolves to the task's own state. `completed`
  renders as an ordinary settled row; `failed` and `stopped` get `err` / `warn`.
  The `outline` tone lesson from RFC 0055 carries over for the running badge
  (neutral is illegible on light themes).
- The tooltip must **not** repeat the handed-off row's "Silo isn't told when it
  finishes" — here it is.

### Rendering — tier 2, the aggregate

`N background shell(s) running` in the panel chrome, beside
`delegatedDispatchNotice`'s `N background agents working`, scoped to the current
exchange and cleared by the next prompt.

**This count comes down**, and it does so on first principles rather than on the
inference RFC 0057 had to argue for: every backgrounded task has an identified
terminal state, so outstanding is dispatched-minus-finished with nothing guessed.

Two things inherited deliberately from RFC 0057's two documented mistakes:

1. **Not gated on `AgentInfo.activity`.** A backgrounded shell outliving its turn
   is the normal case, not the edge — so gating on liveness would hide the line
   in exactly the situation it exists for. This mistake has already been made
   once here and is not worth making twice.
2. **Absence of a finish is never read as a finish.** A task with no terminal
   state counts as outstanding.

## Follow-ons

**These are tracked nowhere else — not as GitHub issues, not in another
proposal.** Said plainly because this document is `implemented`, which reads as
finished: nothing routes a reader back here. That is not hypothetical. RFC 0055
recorded backgrounded shells as unblocked inside its own `implemented`
proposal, and the item surfaced two days later only because Dave remembered it,
not because anything surfaced it. File an issue if either of the first two ever
becomes urgent.

- **A stop control** — the real one, and deliberately not urgent. `canStop:
true` and `_session/async_task/stop` (taking `{sessionId, asyncTaskId}`) are
  both confirmed on the wire, so this is scoped work rather than a research
  question. It is out of 0058 because it is a _write_ to the agent — a new `ctx`
  capability and a permission decision — where everything here is read-only
  rendering. **The workaround is good enough in practice (Dave, 2026-10-09): ask
  the agent to stop the command.** It owns the process and will do it, which is
  why a dedicated control buys convenience rather than capability. Worth its own
  proposal when convenience is the thing worth paying for.
- **Streaming the command's output** — low priority. `outputFilePath` is on the
  wire, but it points into the agent's private temp directory, so exposing it is
  a capability decision rather than a field (the same call RFC 0055 made about
  `agentId`). The transcript already shows the agent's own report when the
  command finishes, which covers most of the need.
- **A tab/status-bar indicator** — **decided against, not deferred.** Do not
  file this one. `AgentInfo` carries thirteen scalars and no collections, so it
  structurally cannot see tool-call or task data; ADR 0030 owns indicator glyph,
  motion and colour and explicitly rejected a settled look as an `Activity`
  kind. RFC 0055's reasoning applies unchanged. Reopening this means revisiting
  ADR 0030, not writing a feature.

## Alternatives considered

**Reuse `handedOff` and ship no new field.** Rejected on the wire, not on taste:
a backgrounded Bash trips neither of `handedOff`'s two gates, so there would be
nothing to render. See the public-surface section.

**Give the async task its own transcript row.** Rejected, and the adapter agrees
— `showInTranscript: false`. The `Bash` card is already the row; a second one
would double every backgrounded command in the transcript.

**Don't advertise; infer backgrounding from `toolResponse.backgroundTaskId`.**
That field does ride the capability-free stream (frame 2 above), so a marker is
technically derivable without opting in. Rejected: it would buy the lie-free row
and _not_ the resolution, leaving a row stuck on "running in background" forever
— which is strictly worse than today, where it at least eventually stops
animating. The capability is what makes the feature resolvable, and resolvability
is the feature.

## Implementation

Single phase.

- `packages/extension-host/src/extension-host/agents/` —
  `chat-background-tasks.ts` (new, the quarantine), `acp-jsonrpc.ts`
  (`AIR_CLIENT_META`), `acp-update-model.ts` (`parseToolCall`),
  `acp-sessions-service.ts` (`toSdkUpdate`).
- `packages/sdk/src/agents-service.ts` — `AgentToolCall.backgrounded`,
  `AgentBackgroundTask`, `AgentBackgroundTaskState`,
  `AgentSessionUpdate.backgroundTask`.
- `packages/extensions-silo/src/agents-chat-panel/` — `transcript-model.ts`,
  `AcpChatPanel.tsx`, `acp-chat.css`.
- Docs: `apps/docs/api/agents/sessions.md`, the roadmap's Chat-sessions row, the
  generated `api/types` reference, and `docs/domain-language.md`
  (Backgrounded shell / Background task).
- Probe + capture under `scratchpad/acp-probe/`.

## Related decisions

- [ADR 0057](../decisions/0057-advertising-a-vendor-protocol-extension.md) — the
  rules for advertising a vendor protocol extension. This is its second instance;
  the ADR does not need re-deciding, only following.
- [ADR 0056](../decisions/0056-vendor-meta-through-one-quarantine.md) — one
  quarantine module per feature, which is why this is a sibling module.
- [RFC 0055](./0055-chat-async-tasks.md) — the subagent half, and the source of
  this proposal's open item.
- [RFC 0057](./0057-subagent-sessions.md) — `delegations`, whose shape
  `backgroundTasks` mirrors.
- [ADR 0030](../decisions/0030-activity-chrome.md) — why there is no tab
  indicator.
- [ADR 0017](../decisions/0017-css-theming-contract.md) — design tokens only.
