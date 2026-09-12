# Interface: AgentToolCall

Defined in: [packages/sdk/src/agents-service.ts:661](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L661)

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

Defined in: [packages/sdk/src/agents-service.ts:665](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L665)

**`Beta`**

The call's id — stable across its `tool_call` and every
 `tool_call_update`, and the same id an
 [AgentPermissionRequest.toolCallId](AgentPermissionRequest.md#toolcallid) refers to.

***

### title?

```ts
readonly optional title?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:669](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L669)

**`Beta`**

Human-readable label, e.g. `"Read notes.md"`. Present on the opening
 `tool_call`, and on an update only when it changed — agents do relabel a
 call as it progresses.

***

### kind?

```ts
readonly optional kind?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:674](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L674)

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

Defined in: [packages/sdk/src/agents-service.ts:678](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L678)

**`Beta`**

`"pending"`, `"in_progress"`, `"completed"`, `"failed"`, or a vendor's
 own. Not every agent walks the whole ladder — `claude-agent-acp` 0.75.1
 went `pending` → `completed` with no `in_progress`.

***

### content?

```ts
readonly optional content?: readonly AgentToolCallContent[];
```

Defined in: [packages/sdk/src/agents-service.ts:681](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L681)

**`Beta`**

What to show inside the row. Absent on an update that changed something
 else — treat that as "unchanged", not "now empty".

***

### locations?

```ts
readonly optional locations?: readonly AgentToolCallLocation[];
```

Defined in: [packages/sdk/src/agents-service.ts:683](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L683)

**`Beta`**

The files this call touches.

***

### rawInput?

```ts
readonly optional rawInput?: unknown;
```

Defined in: [packages/sdk/src/agents-service.ts:688](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L688)

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

Defined in: [packages/sdk/src/agents-service.ts:690](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L690)

**`Beta`**

The tool's own result, same caveat as [rawInput](#rawinput).
