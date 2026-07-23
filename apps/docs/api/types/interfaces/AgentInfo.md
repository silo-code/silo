# Interface: AgentInfo

Defined in: [packages/sdk/src/agents-service.ts:41](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L41)

**`Beta`**

Live agent-activity and resume-identity state for one terminal, computed
once by the host and shared across every subscriber — never recomputed
per-extension. Returned by [AgentsService.getState](AgentsService.md#getstate) and
[AgentsService.getByTerminalId](AgentsService.md#getbyterminalid); delivered to
[AgentsService.subscribe](AgentsService.md#subscribe) listeners on every change.

## Properties

### terminalId

```ts
readonly terminalId: string;
```

Defined in: [packages/sdk/src/agents-service.ts:43](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L43)

**`Beta`**

The terminal record id this state belongs to.

***

### workspaceId

```ts
readonly workspaceId: string;
```

Defined in: [packages/sdk/src/agents-service.ts:45](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L45)

**`Beta`**

The workspace this terminal belongs to.

***

### kind

```ts
readonly kind: TerminalKind;
```

Defined in: [packages/sdk/src/agents-service.ts:47](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L47)

**`Beta`**

The terminal's kind at registration time (`"shell"`, `"claude"`, `"pi"`).

***

### isAgent

```ts
readonly isAgent: boolean;
```

Defined in: [packages/sdk/src/agents-service.ts:53](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L53)

**`Beta`**

Whether this terminal currently hosts an agent — true if it was created
as one, or an agent-specific signal was observed in it (e.g. typing
`claude` into a plain shell).

***

### activity

```ts
readonly activity: AgentActivity;
```

Defined in: [packages/sdk/src/agents-service.ts:55](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L55)

**`Beta`**

Current classified activity.

***

### needsAttention

```ts
readonly needsAttention: boolean;
```

Defined in: [packages/sdk/src/agents-service.ts:57](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L57)

**`Beta`**

Sticky "finished, go look" flag — cleared when the terminal is viewed.

***

### attentionSince?

```ts
readonly optional attentionSince?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:59](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L59)

**`Beta`**

ISO timestamp of when `needsAttention` was set; undefined when not pending.

***

### workingSince?

```ts
readonly optional workingSince?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:61](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L61)

**`Beta`**

ISO timestamp of when the current `"working"` phase started; undefined otherwise.

***

### stale

```ts
readonly stale: boolean;
```

Defined in: [packages/sdk/src/agents-service.ts:70](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L70)

**`Beta`**

Soft, time-gap-based, **self-clearing** signal: this restored `working`/
`needsAttention` duration followed a gap long enough that it can't be
fully trusted — the agent may have finished without it being observed.
The next live signal clears it automatically. Distinct from
`activity === "dead"`, which is a hard, structural, non-self-resolving
fact — see [AgentActivity](../type-aliases/AgentActivity.md).

***

### sessionId?

```ts
readonly optional sessionId?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:78](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L78)

**`Beta`**

Resolved session identifier for the agent that was running, if one could
be determined. Only ever populated when `activity === "dead"`. Resolved
once, live, at the moment this terminal's agent was first detected —
not re-resolved at death time — so that concurrent sessions in the same
directory don't collide on a single after-the-fact lookup.

***

### resumeCommand?

```ts
readonly optional resumeCommand?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:85](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L85)

**`Beta`**

A ready-to-show (and copy/paste) resume command, e.g.
`"claude --resume 01abc..."` when a session id was resolved, or a
generic `"was running claude in ~/foo"`-style hint when it wasn't. Only
ever populated when `activity === "dead"`.

***

### agentName?

```ts
readonly optional agentName?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:87](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L87)

**`Beta`**

Human-readable agent name, e.g. `"Claude Code"`. Only ever populated when `activity === "dead"`.
