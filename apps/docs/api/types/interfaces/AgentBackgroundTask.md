# Interface: AgentBackgroundTask

Defined in: [packages/sdk/src/agents-service.ts:1000](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1000)

**`Beta`**

One **backgrounded command's lifecycle** — a shell command that detached from
the agent's turn, and later reported how it ended.

The shell counterpart to [AgentDelegation](AgentDelegation.md), and the resolution for
[AgentToolCall.backgrounded](AgentToolCall.md#backgrounded): that flag says a tool call's
`"completed"` described only the hand-off, and this says what became of the
command itself.

**Unlike delegated work, this resolves.** A subagent dispatch gets no finish
signal on the tool-call stream at all, which is why a UI can only count
dispatches. A backgrounded command reports an identified terminal state, so a
row can settle and a count of outstanding work can come *down*.

**It outlives its turn, and that is the normal case, not an edge.** In the
2026-10-08 capture the turn ended 24 seconds before the command did, with the
session reading idle throughout. So never gate the rendering of this on
whether the agent is currently working — the quiet window is exactly when it
matters.

**Not every agent reports this.** Where the connected agent doesn't,
[AgentSessionUpdate.backgroundTask](AgentSessionUpdate.md#backgroundtask) is simply never set. Treat its
absence as "this agent doesn't say", never as "nothing is running".

## Properties

### asyncTaskId

```ts
readonly asyncTaskId: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1010](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1010)

**`Beta`**

The command this event is about — **the primary key**, stable for the
task's whole life, and the only field always present.

Key on this rather than on [toolCallId](#toolcallid): the announcing frame carries
no tool call at all (see [toolCallId](#toolcallid)), so a consumer keyed on the
call would drop the announcement and with it [name](#name),
[taskType](#tasktype) and [canStop](#canstop).

***

### state?

```ts
readonly optional state?: AgentBackgroundTaskState;
```

Defined in: [packages/sdk/src/agents-service.ts:1019](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1019)

**`Beta`**

Where the command is in its life, **when this frame reported it**.

Absent on a frame that carried only metadata — which is a distinction worth
preserving rather than collapsing to `"running"`: a metadata frame can
arrive *after* a terminal one, and reading it as "running" would resurrect
a finished command.

***

### toolCallId?

```ts
readonly optional toolCallId?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1028](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1028)

**`Beta`**

The tool call this command belongs to — the join that puts the lifecycle on
the right row.

**Learned, not given.** The announcing frame does not carry it; it first
arrives on a later frame, once the agent correlates the two. Accumulate it,
and expect a window in which a task is known but its row is not.

***

### name?

```ts
readonly optional name?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1032](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1032)

**`Beta`**

Human-readable label, e.g. `"Sleep for 30 seconds"`. Carried on the
 announcement, not on later state changes, so accumulate it rather than
 expecting it on the terminal event.

***

### taskType?

```ts
readonly optional taskType?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1035](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1035)

**`Beta`**

The agent's coarse category for the work, e.g. `"shell"`. Same
 accumulation caveat as [name](#name).

***

### canStop?

```ts
readonly optional canStop?: boolean;
```

Defined in: [packages/sdk/src/agents-service.ts:1038](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1038)

**`Beta`**

Whether the agent would honour a request to stop this command. Same
 accumulation caveat as [name](#name).

***

### summary?

```ts
readonly optional summary?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1040](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1040)

**`Beta`**

The agent's own closing summary, when it sent one.
