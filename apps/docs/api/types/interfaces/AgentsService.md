# Interface: AgentsService

Defined in: [packages/sdk/src/agents-service.ts:1357](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1357)

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

## Consumer Services

### catalog()

```ts
catalog(): readonly CatalogAgentSummary[];
```

Defined in: [packages/sdk/src/agents-service.ts:1540](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1540)

Every coding agent Silo knows about, as read-only
[CatalogAgentSummary](CatalogAgentSummary.md) records. Detection stays sealed (ADR 0028) —
there is no way to register into this list.

The returned array is **memoized and deeply frozen**: it is read inside
tab-icon rendering (`ctx.terminals.bindIcon`), so a fresh allocation per
call would be a per-render cost and a mutable one a correctness hazard.

#### Returns

readonly [`CatalogAgentSummary`](CatalogAgentSummary.md)[]

***

### profiles

```ts
readonly profiles: AgentProfilesService;
```

Defined in: [packages/sdk/src/agents-service.ts:1549](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1549)

**`Beta`**

The user's **Agent Profiles** — read them, and start one, optionally with
an opening prompt. See [AgentProfilesService](AgentProfilesService.md).

***

### sessions

```ts
readonly sessions: AgentSessionsService;
```

Defined in: [packages/sdk/src/agents-service.ts:1560](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1560)

**`Beta`**

Connect to and drive a **Chat session** — a user-authored `chat` profile
spawned as an Agent Client Protocol child (RFC 0038 phase 2). See
[AgentSessionsService](AgentSessionsService.md). Needs the `"agents"` [Permission](../type-aliases/Permission.md):
every `connect()` throws without it.

## Other

### getState()

```ts
getState(options?): AgentInfo[];
```

Defined in: [packages/sdk/src/agents-service.ts:1363](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1363)

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

Defined in: [packages/sdk/src/agents-service.ts:1368](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1368)

**`Beta`**

Look up [AgentInfo](AgentInfo.md) for a specific terminal tab by its record id.
 Only ever resolves a `kind: "terminal"` session — use
 [AgentsService.getState](#getstate) and match on [AgentInfo.id](AgentInfo.md#id) to find a
 Chat session.

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

Defined in: [packages/sdk/src/agents-service.ts:1374](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1374)

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
acknowledge(id): void;
```

Defined in: [packages/sdk/src/agents-service.ts:1405](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1405)

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

##### id

`string`

— an [AgentInfo.id](AgentInfo.md#id). A terminal record id is one (every
Terminal session's `id` equals its `terminalId`), so existing callers
passing a terminal id keep working; a Chat session's id works too.

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

***

### getActive()

```ts
getActive(): string | null;
```

Defined in: [packages/sdk/src/agents-service.ts:1425](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1425)

**`Beta`**

The Agent Session the user is currently **looking at** — the one whose
surface is the active tab — or `null` when the active tab is not an agent
at all (an editor, a settings page, nothing).

Kind-agnostic by construction: a terminal tab reports its Terminal
session, and a dock panel that declared
`DockPanelApi.setAgentSession` reports its Chat session. That is
what lets one consumer implement "clear the badge for the session I'm
watching" or "hide the row for the session I'm already looking at" without
knowing which kind it got.

#### Returns

`string` \| `null`

#### Example

```ts
// Hide the status row for whatever the user is already watching.
const watching = ctx.agents.getActive();
const rows = ctx.agents.getState().filter((a) => a.id !== watching);
```

***

### subscribeActive()

```ts
subscribeActive(listener): Disposable;
```

Defined in: [packages/sdk/src/agents-service.ts:1431](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1431)

**`Beta`**

Subscribe to changes in [AgentsService.getActive](#getactive) — fired with the
new value (or `null`) whenever the active surface moves. Returns a
[Disposable](Disposable.md) that cancels the subscription.

#### Parameters

##### listener

(`id`) => `void`

#### Returns

[`Disposable`](Disposable.md)

***

### bindActivity()

```ts
bindActivity(binder): Disposable;
```

Defined in: [packages/sdk/src/agents-service.ts:1464](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1464)

**`Beta`**

Bind a provider of **activity badges** for Agent Session tabs — the
host-owned `Activity` chrome (spinner / ready / warn / error) on the
trailing edge of a tab.

The binder's `provide` is handed an [AgentInfo.id](AgentInfo.md#id), and the host
routes the result to whichever tab is showing that session: a terminal tab
for a Terminal session, or the dock panel that declared
`DockPanelApi.setAgentSession` for a Chat session. One binder,
both kinds — which is the point: the `ctx.terminals` equivalent takes a
*terminal* id, so an extension literally could not badge a Chat session.

`provide` is called synchronously for every visible tab during render.
Keep it a lookup: no allocation, no async, no work proportional to the
number of sessions.

#### Parameters

##### binder

[`TabActivityBinder`](TabActivityBinder.md)

#### Returns

[`Disposable`](Disposable.md)

#### Example

```ts
ctx.subscriptions.push(
  ctx.agents.bindActivity({
    id: "my-ext.agent-badge",
    provide(agentSessionId) {
      const info = ctx.agents
        .getState({ allWorkspaces: true })
        .find((a) => a.id === agentSessionId);
      if (info?.activity !== "working") return null;
      return { activity: "working", tooltip: "Agent working" };
    },
  }),
);
```

***

### bindIcon()

```ts
bindIcon(binder): Disposable;
```

Defined in: [packages/sdk/src/agents-service.ts:1475](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1475)

**`Beta`**

Bind a provider of **leading icons** for Agent Session tabs — a brand mark
so a tab running an agent is identifiable at a glance. Same routing and
same synchronous-`provide` contract as
[AgentsService.bindActivity](#bindactivity).

Return `null` for "no icon". Take care that a component which renders
nothing produces `null` here rather than a truthy element descriptor, or
the host reserves tab space for an icon that never appears.

#### Parameters

##### binder

[`TabIconBinder`](TabIconBinder.md)

#### Returns

[`Disposable`](Disposable.md)

***

### invalidateAdornments()

```ts
invalidateAdornments(): void;
```

Defined in: [packages/sdk/src/agents-service.ts:1482](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1482)

**`Beta`**

Re-query every bound [AgentsService.bindActivity](#bindactivity) /
[AgentsService.bindIcon](#bindicon) provider. Call it when something *outside*
the agent snapshot changed what a provider would return — a setting, the
active theme — since the host cannot know about those.

#### Returns

`void`

***

### close()

```ts
close(id): void;
```

Defined in: [packages/sdk/src/agents-service.ts:1493](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1493)

**`Beta`**

End an Agent Session, either kind: close its terminal tab, or close the
dock panel that declared `DockPanelApi.setAgentSession` for it
(which reaps the agent process as the panel unmounts).

A no-op for an unknown id, or for a Chat session with no panel mounted —
Silo will not kill a connection whose UI it cannot account for.

#### Parameters

##### id

`string`

— an [AgentInfo.id](AgentInfo.md#id).

#### Returns

`void`

***

### reveal()

```ts
reveal(id): void;
```

Defined in: [packages/sdk/src/agents-service.ts:1507](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1507)

**`Beta`**

Bring an Agent Session into view: focus its terminal tab if it is a
Terminal session, or its transcript panel if it is a Chat session —
activating the owning workspace first. The caller does not need to know
which kind it is, which is the whole point of the verb (RFC 0038): a
consumer holding an [AgentInfo.id](AgentInfo.md#id) should never have to branch to
`ctx.terminals.focus` vs. some chat-panel API.

A no-op for an unknown id, or when the session's backing surface is gone
(a closed terminal, a disposed panel).

#### Parameters

##### id

`string`

— an [AgentInfo.id](AgentInfo.md#id).

#### Returns

`void`

***

### resume()

```ts
resume(id): void;
```

Defined in: [packages/sdk/src/agents-service.ts:1527](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1527)

**`Beta`**

Resume a session **through Silo**, when [AgentInfo.canResume](AgentInfo.md#canresume) is
`true`.

- Chat session: spawn a fresh agent process and reconnect the persisted
  id over `session/resume` or `session/load` — whichever the agent
  advertises, `resume` preferred (RFC 0042) — so the transcript and
  context come back after the old process died. Then
  [AgentsService.reveal](#reveal) it.
- Terminal session: currently a no-op — a dead PTY cannot be re-run in
  place, and the resume path stays "the user runs
  [AgentInfo.resumeCommand](AgentInfo.md#resumecommand)". Present on the surface so a
  kind-agnostic consumer can call it unconditionally once Chat sessions
  ship (RFC 0038 phase 4).

A no-op for an unknown id or one whose `canResume` is `false`.

#### Parameters

##### id

`string`

— an [AgentInfo.id](AgentInfo.md#id).

#### Returns

`void`
