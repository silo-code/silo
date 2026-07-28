# Interface: AgentsService

Defined in: [packages/sdk/src/agents-service.ts:139](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L139)

**`Beta`**

Host-computed coding-agent observability — exposed as
[ExtensionContext.agents](ExtensionContext.md#agents). Detection (what OSC/output signals mean
for a given agent) and resume-hint resolution are both sealed inside the
host implementation; there is no registration API. Mirrors
[ProcessesService](ProcessesService.md) in shape: one shared, canonical answer, not
something each extension recomputes — reads are unscoped, and
[AgentsService.acknowledge](#acknowledge) is the one deliberately scoped mutation,
the same pattern [ProcessesService.kill](ProcessesService.md#kill) establishes.

## Example

```ts
const sub = ctx.agents.subscribe((agents) => {
  const dead = agents.find((a) => a.activity === "dead");
  if (dead) ctx.ui.notify("info", dead.resumeCommand ?? "An agent session ended.");
});
ctx.subscriptions.push(sub);
```

## Methods

### getState()

```ts
getState(options?): AgentInfo[];
```

Defined in: [packages/sdk/src/agents-service.ts:145](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L145)

**`Beta`**

Current [AgentInfo](AgentInfo.md) for every tracked terminal in the active
workspace. Pass `{ allWorkspaces: true }` for every loaded workspace
instead.

#### Parameters

##### options?

###### allWorkspaces?

`boolean`

#### Returns

[`AgentInfo`](AgentInfo.md)[]

***

### getByTerminalId()

```ts
getByTerminalId(terminalId): AgentInfo | undefined;
```

Defined in: [packages/sdk/src/agents-service.ts:147](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L147)

**`Beta`**

Look up [AgentInfo](AgentInfo.md) for a specific terminal tab by its record id.

#### Parameters

##### terminalId

`string`

#### Returns

[`AgentInfo`](AgentInfo.md) \| `undefined`

***

### subscribe()

```ts
subscribe(listener, options?): Disposable;
```

Defined in: [packages/sdk/src/agents-service.ts:153](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L153)

**`Beta`**

Subscribe to changes in the active workspace's agent state. Pass
`{ allWorkspaces: true }` to be notified across every loaded workspace
instead. Returns a [Disposable](Disposable.md) that cancels the subscription.

#### Parameters

##### listener

(`state`) => `void`

##### options?

###### allWorkspaces?

`boolean`

#### Returns

[`Disposable`](Disposable.md)

***

### acknowledge()

```ts
acknowledge(terminalId): void;
```

Defined in: [packages/sdk/src/agents-service.ts:180](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L180)

**`Beta`**

Acknowledge a finished run: clears [AgentInfo.needsAttention](AgentInfo.md#needsattention) (and
its `attentionSince` timestamp). A no-op if the terminal wasn't pending
attention. Doesn't touch `activity` — `"idle"` already correctly
describes the agent both before and after acknowledgment; only whether
a human has seen it changes.

Deliberately **not** wired to focus automatically by the host — whether
*viewing* a terminal should count as acknowledging it is a per-consumer
policy call this method leaves to you, not a fixed rule `ctx.agents`
imposes. Call it from wherever your own UI decides a run has been seen —
typically `ctx.terminals.subscribeActive`, but it doesn't have to be.

#### Parameters

##### terminalId

`string`

#### Returns

`void`

#### Example

```ts
// Acknowledge whenever the user actually looks at the terminal.
ctx.subscriptions.push(
  ctx.terminals.subscribeActive((terminalId) => {
    if (terminalId) ctx.agents.acknowledge(terminalId);
  }),
);
```
