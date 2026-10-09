# Interface: AgentDelegation

Defined in: [packages/sdk/src/agents-service.ts:919](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L919)

**`Beta`**

One **delegated worker's lifecycle** — a named subagent appearing, and later
reporting how it ended.

This is the signal that lets a transcript stop guessing about delegated
work. [AgentToolCall.handedOff](AgentToolCall.md#handedoff) says a dispatch's `"completed"` was
only a hand-off; this says when the handed-off work actually finished, and
*which* worker's it was. A UI can therefore show a per-agent result and a
count of outstanding work that comes down — neither of which is derivable
from the tool-call stream, which never revisits a dispatch.

**Not every agent reports this.** Where the connected agent doesn't,
[AgentSessionUpdate.delegation](AgentSessionUpdate.md#delegation) is simply never set and a UI falls
back to counting dispatches. Treat its absence as "this agent doesn't say",
never as "nothing is running".

## Properties

### subagentId

```ts
readonly subagentId: string;
```

Defined in: [packages/sdk/src/agents-service.ts:931](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L931)

**`Beta`**

The worker this event is about — the same id that appears on
[AgentToolCall.subagentId](AgentToolCall.md#subagentid) for the dispatch that started it and on
[AgentSessionUpdate.subagentId](AgentSessionUpdate.md#subagentid) for every frame it produces.

**Stable across every event for one worker**, including the repeat
announcements some agents send when a worker resumes: Silo normalises the
vendor's generation suffix away, so a consumer keyed on this id counts one
worker once. The un-normalised form stays in
[AgentSessionUpdate.raw](AgentSessionUpdate.md#raw) for anyone who wants it.

***

### name?

```ts
readonly optional name?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:935](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L935)

**`Beta`**

The worker's human-readable name, e.g. `"Background sleep task"` —
 carried on the announcement, not on later state changes, so accumulate it
 rather than expecting it on the terminal event.

***

### task?

```ts
readonly optional task?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:938](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L938)

**`Beta`**

The prompt the worker was given. Same accumulation caveat as
 [name](#name), and it can be long — agents put structured payloads here.

***

### state

```ts
readonly state: AgentDelegationState;
```

Defined in: [packages/sdk/src/agents-service.ts:940](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L940)

**`Beta`**

Where the worker is in its life. See [AgentDelegationState](../type-aliases/AgentDelegationState.md).
