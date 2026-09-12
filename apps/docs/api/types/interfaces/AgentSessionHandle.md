# Interface: AgentSessionHandle

Defined in: [packages/sdk/src/agents-service.ts:939](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L939)

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

Defined in: [packages/sdk/src/agents-service.ts:945](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L945)

**`Beta`**

This session's [AgentInfo.id](AgentInfo.md#id) — the key [AgentsService.reveal](AgentsService.md#reveal),
[AgentsService.resume](AgentsService.md#resume) and [AgentsService.acknowledge](AgentsService.md#acknowledge) take.
Stable across a [AgentsService.resume](AgentsService.md#resume).

***

### sessionId

```ts
readonly sessionId: string;
```

Defined in: [packages/sdk/src/agents-service.ts:955](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L955)

**`Beta`**

The agent's own session id (`session/new`'s `sessionId`, or the fresh id
`session/load` adopted) — what to pass back as
[AgentSessionRestore.sessionId](AgentSessionRestore.md#sessionid) on a future [AgentSessionsService.connect](AgentSessionsService.md#connect) to restore this conversation (RFC 0042).
Distinct from [AgentSessionHandle.id](#id), which is namespaced for
`ctx.agents` and does not change even when this does (an adopted id after
`session/load`).

***

### agentId?

```ts
readonly optional agentId?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:958](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L958)

**`Beta`**

The user's asserted catalog agent id for the profile, if any — the same
 value that selects the profile's `+`-menu icon.

***

### agentName

```ts
readonly agentName: string;
```

Defined in: [packages/sdk/src/agents-service.ts:961](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L961)

**`Beta`**

Display name for the agent: what it declared at connect (`initialize`),
 falling back to the profile label when it declared none (recon Finding 4).

***

### canResume

```ts
readonly canResume: boolean;
```

Defined in: [packages/sdk/src/agents-service.ts:967](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L967)

**`Beta`**

Whether the agent advertises `session/resume` or `session/load`, i.e.
whether [AgentsService.resume](AgentsService.md#resume) can bring this conversation back
after the process dies. Mirrors [AgentInfo.canResume](AgentInfo.md#canresume).

***

### resumeOutcome

```ts
readonly resumeOutcome: "resumed" | "journal-only" | "new";
```

Defined in: [packages/sdk/src/agents-service.ts:982](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L982)

**`Beta`**

How this handle came to be connected (RFC 0042) — see
[AgentSessionRestore](AgentSessionRestore.md):

- `"new"` — an ordinary `session/new` (no [AgentSessionConnectOptions.resume](AgentSessionConnectOptions.md#resume) was given, or the persisted session
  had gone stale and `connect()` fell through to a fresh one).
- `"resumed"` — a persisted session reconnected, via `session/resume` or
  `session/load`.
- `"journal-only"` — the agent could do neither. There is no live
  session: [prompt](#prompt) rejects. Reconnect with
  `resume: { sessionId, startFresh: true }` to continue in a new one,
  preserving [journal](#journal) for continuity.

***

### journal

```ts
readonly journal: readonly AgentSessionUpdate[];
```

Defined in: [packages/sdk/src/agents-service.ts:992](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L992)

**`Beta`**

Prior turns to paint **before** subscribing to [onUpdate](#onupdate) — the
**transcript journal** (RFC 0042), read from disk. Empty when
[resumeOutcome](#resumeoutcome) is `"new"` and nothing preceded this connection;
populated for `"resumed"` (a `session/resume` reconnect, which itself
replays nothing — this is the only record) and `"journal-only"`. Feed
these through the same reducer as [onUpdate](#onupdate) before subscribing to
it, e.g. `journal.reduce(applyUpdate, emptyTranscript)`.

***

### configOptions

```ts
readonly configOptions: readonly AgentSessionConfigOption[];
```

Defined in: [packages/sdk/src/agents-service.ts:1029](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1029)

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

Defined in: [packages/sdk/src/agents-service.ts:1000](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1000)

**`Beta`**

Send a prompt turn and resolve when it ends. Content is structured blocks,
never a shell string. Rejects if the turn cannot be completed (connection
lost, agent error) — with the agent's message where it gave one. Also
rejects immediately when [resumeOutcome](#resumeoutcome) is `"journal-only"` — there
is no live agent to prompt.

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

Defined in: [packages/sdk/src/agents-service.ts:1006](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1006)

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

Defined in: [packages/sdk/src/agents-service.ts:1013](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1013)

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

Defined in: [packages/sdk/src/agents-service.ts:1019](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1019)

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

Defined in: [packages/sdk/src/agents-service.ts:1051](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1051)

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

Defined in: [packages/sdk/src/agents-service.ts:1058](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1058)

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

Defined in: [packages/sdk/src/agents-service.ts:1065](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1065)

**`Beta`**

Tear the session down: kill the agent process and drop it from
[AgentsService.getState](AgentsService.md#getstate). Idempotent. The process is a piped child of
Silo — it does **not** survive this, and closing the workspace or quitting
the app reaps it the same way.

#### Returns

`void`
