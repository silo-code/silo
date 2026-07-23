# Interface: AgentsService

Defined in: [packages/sdk/src/agents-service.ts:111](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L111)

**`Beta`**

Host-computed, read-only coding-agent observability — exposed as
[ExtensionContext.agents](ExtensionContext.md#agents). Detection (what OSC/output signals mean
for a given agent) and resume-hint resolution are both sealed inside the
host implementation; there is no registration API. Mirrors
[ProcessesService](ProcessesService.md) in shape: one shared, canonical answer, not
something each extension recomputes.

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

Defined in: [packages/sdk/src/agents-service.ts:117](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L117)

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

Defined in: [packages/sdk/src/agents-service.ts:119](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L119)

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

Defined in: [packages/sdk/src/agents-service.ts:125](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L125)

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
