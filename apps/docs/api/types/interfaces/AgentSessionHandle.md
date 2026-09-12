# Interface: AgentSessionHandle

Defined in: [packages/sdk/src/agents-service.ts:592](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L592)

**`Beta`**

A live handle to one **Chat session** (RFC 0038) — an Agent Client Protocol
child Silo spawned from a user-authored Chat profile, speaking structured
JSON-RPC over piped stdio. Returned by [AgentSessionsService.connect](AgentSessionsService.md#connect).

The same session shows up in [AgentsService.getState](AgentsService.md#getstate) as an
[AgentInfo](AgentInfo.md) with `kind: "chat"` and this handle's [id](#id) — so the
Agents navigator, attention badges and status all work for it exactly as for
a Terminal session, with no extra wiring.

Drive one turn at a time: call [prompt](#prompt), await its
[AgentPromptResult](AgentPromptResult.md), then prompt again.

## Properties

### id

```ts
readonly id: string;
```

Defined in: [packages/sdk/src/agents-service.ts:598](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L598)

**`Beta`**

This session's [AgentInfo.id](AgentInfo.md#id) — the key [AgentsService.reveal](AgentsService.md#reveal),
[AgentsService.resume](AgentsService.md#resume) and [AgentsService.acknowledge](AgentsService.md#acknowledge) take.
Stable across a [AgentsService.resume](AgentsService.md#resume).

***

### agentId?

```ts
readonly optional agentId?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:601](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L601)

**`Beta`**

The user's asserted catalog agent id for the profile, if any — the same
 value that selects the profile's `+`-menu icon.

***

### agentName

```ts
readonly agentName: string;
```

Defined in: [packages/sdk/src/agents-service.ts:604](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L604)

**`Beta`**

Display name for the agent: what it declared at connect (`initialize`),
 falling back to the profile label when it declared none (recon Finding 4).

***

### canResume

```ts
readonly canResume: boolean;
```

Defined in: [packages/sdk/src/agents-service.ts:610](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L610)

**`Beta`**

Whether the agent advertises `session/load`, i.e. whether
[AgentsService.resume](AgentsService.md#resume) can bring this conversation back after the
process dies. Mirrors [AgentInfo.canResume](AgentInfo.md#canresume).

## Methods

### prompt()

```ts
prompt(blocks): Promise<AgentPromptResult>;
```

Defined in: [packages/sdk/src/agents-service.ts:616](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L616)

**`Beta`**

Send a prompt turn and resolve when it ends. Content is structured blocks,
never a shell string. Rejects if the turn cannot be completed (connection
lost, agent error) — with the agent's message where it gave one.

#### Parameters

##### blocks

readonly [`AgentPromptBlock`](../type-aliases/AgentPromptBlock.md)[]

#### Returns

`Promise`\<[`AgentPromptResult`](AgentPromptResult.md)\>

***

### cancel()

```ts
cancel(): void;
```

Defined in: [packages/sdk/src/agents-service.ts:622](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L622)

**`Beta`**

Ask the agent to stop the current turn (Agent Client Protocol
`session/cancel`). The in-flight [prompt](#prompt) promise then resolves with
`stopReason: "cancelled"` rather than rejecting.

#### Returns

`void`

***

### onUpdate()

```ts
onUpdate(listener): Disposable;
```

Defined in: [packages/sdk/src/agents-service.ts:629](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L629)

**`Beta`**

Subscribe to the turn's [AgentSessionUpdate](AgentSessionUpdate.md) stream — streaming text,
tool calls, plans. Fires only between [prompt](#prompt) and its resolution,
plus a replay of prior turns right after [AgentsService.resume](AgentsService.md#resume).
Returns a [Disposable](Disposable.md).

#### Parameters

##### listener

(`update`) => `void`

#### Returns

[`Disposable`](Disposable.md)

***

### onPermission()

```ts
onPermission(listener): Disposable;
```

Defined in: [packages/sdk/src/agents-service.ts:635](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L635)

**`Beta`**

Subscribe to [AgentPermissionRequest](AgentPermissionRequest.md)s. Returns a [Disposable](Disposable.md).
With at least one listener registered, answering is your responsibility;
with none, Silo answers `cancelled`.

#### Parameters

##### listener

(`request`) => `void`

#### Returns

[`Disposable`](Disposable.md)

***

### dispose()

```ts
dispose(): void;
```

Defined in: [packages/sdk/src/agents-service.ts:642](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L642)

**`Beta`**

Tear the session down: kill the agent process and drop it from
[AgentsService.getState](AgentsService.md#getstate). Idempotent. The process is a piped child of
Silo — it does **not** survive this, and closing the workspace or quitting
the app reaps it the same way.

#### Returns

`void`
