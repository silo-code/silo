# Interface: AgentSessionHandle

Defined in: [packages/sdk/src/agents-service.ts:893](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L893)

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

Defined in: [packages/sdk/src/agents-service.ts:899](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L899)

**`Beta`**

This session's [AgentInfo.id](AgentInfo.md#id) — the key [AgentsService.reveal](AgentsService.md#reveal),
[AgentsService.resume](AgentsService.md#resume) and [AgentsService.acknowledge](AgentsService.md#acknowledge) take.
Stable across a [AgentsService.resume](AgentsService.md#resume).

***

### agentId?

```ts
readonly optional agentId?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:902](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L902)

**`Beta`**

The user's asserted catalog agent id for the profile, if any — the same
 value that selects the profile's `+`-menu icon.

***

### agentName

```ts
readonly agentName: string;
```

Defined in: [packages/sdk/src/agents-service.ts:905](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L905)

**`Beta`**

Display name for the agent: what it declared at connect (`initialize`),
 falling back to the profile label when it declared none (recon Finding 4).

***

### canResume

```ts
readonly canResume: boolean;
```

Defined in: [packages/sdk/src/agents-service.ts:911](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L911)

**`Beta`**

Whether the agent advertises `session/load`, i.e. whether
[AgentsService.resume](AgentsService.md#resume) can bring this conversation back after the
process dies. Mirrors [AgentInfo.canResume](AgentInfo.md#canresume).

***

### configOptions

```ts
readonly configOptions: readonly AgentSessionConfigOption[];
```

Defined in: [packages/sdk/src/agents-service.ts:946](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L946)

**`Beta`**

The session-level controls the agent advertised at connect — mode, model,
and whatever else it offers, each a self-describing
[AgentSessionConfigOption](AgentSessionConfigOption.md). Empty when it advertised none.

This is a **live snapshot**: [setConfigOption](#setconfigoption) and a mode the agent
changes itself both update it in place. Subscribe with
[onConfigOptionsChanged](#onconfigoptionschanged) and re-read.

## Methods

### prompt()

```ts
prompt(blocks): Promise<AgentPromptResult>;
```

Defined in: [packages/sdk/src/agents-service.ts:917](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L917)

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

Defined in: [packages/sdk/src/agents-service.ts:923](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L923)

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

Defined in: [packages/sdk/src/agents-service.ts:930](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L930)

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

Defined in: [packages/sdk/src/agents-service.ts:936](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L936)

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

### setConfigOption()

```ts
setConfigOption(id, value): Promise<void>;
```

Defined in: [packages/sdk/src/agents-service.ts:968](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L968)

**`Beta`**

Change one advertised control. `id` names an entry in
[configOptions](#configoptions); `value` is one of that entry's
[AgentSessionConfigChoice.value](AgentSessionConfigChoice.md#value)s.

Works for **any** category the agent advertises, including ones Silo has
never heard of — the host writes through the protocol's generic
`session/set_config_option`, falling back to the typed
`session/set_mode` / `session/set_model` only for an agent that does not
implement it.

Rejects, with nothing written, on an unknown `id` or a `value` outside
that entry's options — and with the agent's own message when the agent
refuses (an adapter may advertise an entry its own handler does not know).
A rejection is a signal to stop offering that control.

Resolves once the agent has acknowledged the change. [configOptions](#configoptions)
is then replaced from the agent's own updated list — setting one option can
move another — and [onConfigOptionsChanged](#onconfigoptionschanged) fires just before it
resolves.

#### Parameters

##### id

`string`

##### value

`string`

#### Returns

`Promise`\<`void`\>

***

### onConfigOptionsChanged()

```ts
onConfigOptionsChanged(listener): Disposable;
```

Defined in: [packages/sdk/src/agents-service.ts:975](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L975)

**`Beta`**

Fires whenever [configOptions](#configoptions) changes — a [setConfigOption](#setconfigoption)
landing, or the agent moving a value on its own (an ACP
`current_mode_update`). Re-read [configOptions](#configoptions) from the handle.
Returns a [Disposable](Disposable.md).

#### Parameters

##### listener

() => `void`

#### Returns

[`Disposable`](Disposable.md)

***

### dispose()

```ts
dispose(): void;
```

Defined in: [packages/sdk/src/agents-service.ts:982](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L982)

**`Beta`**

Tear the session down: kill the agent process and drop it from
[AgentsService.getState](AgentsService.md#getstate). Idempotent. The process is a piped child of
Silo — it does **not** survive this, and closing the workspace or quitting
the app reaps it the same way.

#### Returns

`void`
