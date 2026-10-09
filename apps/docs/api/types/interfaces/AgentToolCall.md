# Interface: AgentToolCall

Defined in: [packages/sdk/src/agents-service.ts:750](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L750)

**`Beta`**

One tool call an agent is making, carried by a `tool_call` (the call opening)
or a `tool_call_update` (a change to one already open) — see
[AgentSessionUpdate.toolCall](AgentSessionUpdate.md#toolcall).

**Both kinds map to this same type, so only [toolCallId](#toolcallid) is
guaranteed.** A `tool_call` typically carries `title`, `kind` and `status`;
a `tool_call_update` carries **only the fields that changed** (in the
2026-09-08 probe, most updates were `{ toolCallId, status }` alone). So a
consumer keys rows by [toolCallId](#toolcallid) and patches the fields that are
present — never overwrite a title with `undefined`.

A `tool_call_update` for a call whose opening `tool_call` never arrived is a
real shape; render it rather than dropping it.

## Properties

### toolCallId

```ts
readonly toolCallId: string;
```

Defined in: [packages/sdk/src/agents-service.ts:754](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L754)

**`Beta`**

The call's id — stable across its `tool_call` and every
 `tool_call_update`, and the same id an
 [AgentPermissionRequest.toolCallId](AgentPermissionRequest.md#toolcallid) refers to.

***

### title?

```ts
readonly optional title?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:758](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L758)

**`Beta`**

Human-readable label, e.g. `"Read notes.md"`. Present on the opening
 `tool_call`, and on an update only when it changed — agents do relabel a
 call as it progresses.

***

### kind?

```ts
readonly optional kind?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:763](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L763)

**`Beta`**

The protocol's coarse category: `"read"`, `"edit"`, `"delete"`,
 `"move"`, `"search"`, `"execute"`, `"think"`, `"fetch"`,
 `"switch_mode"`, `"other"`, or a vendor's own. Tolerate unknown values;
 do not switch exhaustively.

***

### status?

```ts
readonly optional status?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:767](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L767)

**`Beta`**

`"pending"`, `"in_progress"`, `"completed"`, `"failed"`, or a vendor's
 own. Not every agent walks the whole ladder — `claude-agent-acp` 0.75.1
 went `pending` → `completed` with no `in_progress`.

***

### content?

```ts
readonly optional content?: readonly AgentToolCallContent[];
```

Defined in: [packages/sdk/src/agents-service.ts:770](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L770)

**`Beta`**

What to show inside the row. Absent on an update that changed something
 else — treat that as "unchanged", not "now empty".

***

### locations?

```ts
readonly optional locations?: readonly AgentToolCallLocation[];
```

Defined in: [packages/sdk/src/agents-service.ts:772](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L772)

**`Beta`**

The files this call touches.

***

### rawInput?

```ts
readonly optional rawInput?: unknown;
```

Defined in: [packages/sdk/src/agents-service.ts:777](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L777)

**`Beta`**

The arguments the agent passed to its own tool, exactly as it sent them.
 **Vendor-shaped by definition** — the protocol places no schema on it, so
 it is typed `unknown`: narrow it yourself, and expect a different shape
 from each agent.

***

### rawOutput?

```ts
readonly optional rawOutput?: unknown;
```

Defined in: [packages/sdk/src/agents-service.ts:779](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L779)

**`Beta`**

The tool's own result, same caveat as [rawInput](#rawinput).

***

### subagent?

```ts
readonly optional subagent?: boolean;
```

Defined in: [packages/sdk/src/agents-service.ts:794](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L794)

**`Beta`**

This call dispatched a **subagent** — the agent handed a piece of work to
another agent rather than doing it itself.

A **durable fact about one frame, never revised**: the agent that sent it
said so, and nothing later unsays it. Carried only on the frames that
announce the dispatch (`claude-agent-acp` 0.75.1 sends it on the opening
`tool_call` and the first few updates, then stops), so a consumer that
patches rows by [toolCallId](#toolcallid) must **accumulate** it — treat absence
as "unchanged", exactly as it does for [title](#title).

Present only where the agent marks a dispatch explicitly; never inferred
from a tool's name.

***

### handedOff?

```ts
readonly optional handedOff?: boolean;
```

Defined in: [packages/sdk/src/agents-service.ts:814](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L814)

**`Beta`**

The call reported a status, but only **handed its work off** to run
elsewhere — so the status describes the dispatch, not the work. A UI must
not render such a call as finished: its `"completed"` means "the hand-off
succeeded", and the delegated work may still have minutes to run.

A **durable fact about one frame, never revised**, and on a different
frame from the status it qualifies — in the 2026-10-06 capture the
hand-off arrived with no `status` and the `status: "completed"` arrived
with no hand-off. Accumulate, as with [subagent](#subagent).

**Liveness is deliberately not modelled here, and should not be added.**
Whether the delegated work is *still running* is derived state that
changes over time, while a tool call in a transcript is history; nothing
on the tool-call stream revisits a dispatch to say it finished either. So
a UI counting these can only count *dispatches*, and must not claim a
*named* delegated agent completed. An agent that reports a per-subagent
finish does so on its own lifecycle updates, not by revising this call.

***

### backgrounded?

```ts
readonly optional backgrounded?: boolean;
```

Defined in: [packages/sdk/src/agents-service.ts:836](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L836)

**`Beta`**

This call's command **detached into the background** — so its status
describes the hand-off, and the command itself may have minutes left to
run. A UI must not render such a call as finished.

A **durable fact about one frame, never revised** — accumulate it, exactly
as with [subagent](#subagent) and [handedOff](#handedoff). It rides the frame the tool
result emits, which in the 2026-10-08 capture is the very frame carrying
the misleading `status: "completed"`.

**Distinct from [handedOff](#handedoff), and the difference is the point.**
`handedOff` means nobody will ever report how the work ended; this means a
terminal state *is* coming, as
[AgentSessionUpdate.backgroundTask](AgentSessionUpdate.md#backgroundtask). So a backgrounded row can
legitimately animate as running and then settle, where a handed-off
dispatch can do neither. The two are not synonyms and a consumer that
collapses them cannot render either honestly.

Set only where the agent marks the detachment explicitly; never inferred
from a tool's name or from a suspiciously fast `"completed"`.

***

### parentToolCallId?

```ts
readonly optional parentToolCallId?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:852](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L852)

**`Beta`**

The [toolCallId](#toolcallid) of the dispatching call this one was made **on
behalf of** — set on every tool call a subagent makes, pointing at the
[subagent](#subagent) dispatch that started it.

A **durable fact about one frame, never revised**, and the one piece of
per-call attribution the delegated lifecycle offers: a UI can show
delegated work as it happens, attributed to the dispatch it belongs to.
The calls may arrive in a *later* turn than the dispatch, so a consumer
should resolve the parent by id rather than by position.

Absent on a call the agent made itself. A pointer to a dispatch the
consumer has never seen (a transcript replayed from mid-delegation) is a
real shape — fall back to rendering the call on its own.

***

### subagentId?

```ts
readonly optional subagentId?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:872](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L872)

**`Beta`**

The delegated worker **this call dispatched** — set on a [subagent](#subagent)
dispatch, and the id that joins this row to the work done on its behalf.

This is the one field that makes per-subagent completion renderable: the
same id arrives on [AgentSessionUpdate.subagentId](AgentSessionUpdate.md#subagentid) for every frame
the worker produces, and on [AgentDelegation.subagentId](AgentDelegation.md#subagentid) when it
finishes. So a UI can take a dispatch row and answer both "what did this
agent do" and "is it done" without inferring anything from timing.

Note the different subject from [AgentSessionUpdate.subagentId](AgentSessionUpdate.md#subagentid):
there, the worker that *authored* the frame; here, the worker this call
*delegated to*. On the dispatching call those are different agents — the
parent dispatches, the child works.

Absent on a call that delegated nothing, and absent on an agent that does
not report delegation at all. **A durable fact about one frame** —
accumulate it by [toolCallId](#toolcallid) as with [subagent](#subagent).
