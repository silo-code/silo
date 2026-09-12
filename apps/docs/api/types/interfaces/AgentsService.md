# Interface: AgentsService

Defined in: [packages/sdk/src/agents-service.ts:860](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L860)

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

Defined in: [packages/sdk/src/agents-service.ts:953](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L953)

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

Defined in: [packages/sdk/src/agents-service.ts:962](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L962)

**`Beta`**

The user's **Agent Profiles** — read them, and start one, optionally with
an opening prompt. See [AgentProfilesService](AgentProfilesService.md).

***

### sessions

```ts
readonly sessions: AgentSessionsService;
```

Defined in: [packages/sdk/src/agents-service.ts:973](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L973)

**`Beta`**

Connect to and drive a **Chat session** — a user-authored `chat` profile
spawned as an Agent Client Protocol child (RFC 0038 phase 2). See
[AgentSessionsService](AgentSessionsService.md). Gated on the `chatAgents` setting: every
`connect()` rejects while it is off.

## Other

### getState()

```ts
getState(options?): AgentInfo[];
```

Defined in: [packages/sdk/src/agents-service.ts:866](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L866)

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

Defined in: [packages/sdk/src/agents-service.ts:871](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L871)

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

Defined in: [packages/sdk/src/agents-service.ts:877](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L877)

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

Defined in: [packages/sdk/src/agents-service.ts:908](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L908)

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

### reveal()

```ts
reveal(id): void;
```

Defined in: [packages/sdk/src/agents-service.ts:922](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L922)

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

Defined in: [packages/sdk/src/agents-service.ts:940](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L940)

**`Beta`**

Resume a session **through Silo**, when [AgentInfo.canResume](AgentInfo.md#canresume) is
`true`.

- Chat session: spawn a fresh agent process and `session/load` the
  persisted id, so the transcript and context come back after the old
  process died. Then [AgentsService.reveal](#reveal) it.
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
