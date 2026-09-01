# Interface: AgentInfo

Defined in: [packages/sdk/src/agents-service.ts:42](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L42)

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

Defined in: [packages/sdk/src/agents-service.ts:44](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L44)

**`Beta`**

The terminal record id this state belongs to.

***

### workspaceId

```ts
readonly workspaceId: string;
```

Defined in: [packages/sdk/src/agents-service.ts:46](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L46)

**`Beta`**

The workspace this terminal belongs to.

***

### ~~kind~~

```ts
readonly kind: TerminalKind;
```

Defined in: [packages/sdk/src/agents-service.ts:56](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L56)

**`Beta`**

The terminal's kind at registration time.

#### Deprecated

Always `"shell"` after RFC 0033 — the deprecated `"claude"` /
`"pi"` kinds are normalized away at load and nothing creates them, so a
consumer branching on this is reading a constant. Use
[AgentInfo.agentId](#agentid) for which agent is running, and
[AgentInfo.isAgent](#isagent) for whether one is.

***

### isAgent

```ts
readonly isAgent: boolean;
```

Defined in: [packages/sdk/src/agents-service.ts:62](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L62)

**`Beta`**

Whether this terminal currently hosts an agent — true if it was created
as one, or an agent-specific signal was observed in it (e.g. typing
`claude` into a plain shell).

***

### activity

```ts
readonly activity: AgentActivity;
```

Defined in: [packages/sdk/src/agents-service.ts:64](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L64)

**`Beta`**

Current classified activity.

***

### needsAttention

```ts
readonly needsAttention: boolean;
```

Defined in: [packages/sdk/src/agents-service.ts:72](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L72)

**`Beta`**

Sticky "finished, go look" flag: set when the agent goes idle in a
terminal that wasn't the active one at that moment, and cleared only by
[AgentsService.acknowledge](AgentsService.md#acknowledge). Never set at all if the terminal
*was* already active the instant the agent went idle — being watched
live counts as already seen, no acknowledgment needed.

***

### attentionSince?

```ts
readonly optional attentionSince?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:74](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L74)

**`Beta`**

ISO timestamp of when `needsAttention` was set; undefined when not pending.

***

### workingSince?

```ts
readonly optional workingSince?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:76](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L76)

**`Beta`**

ISO timestamp of when the current `"working"` phase started; undefined otherwise.

***

### stale

```ts
readonly stale: boolean;
```

Defined in: [packages/sdk/src/agents-service.ts:85](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L85)

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

Defined in: [packages/sdk/src/agents-service.ts:95](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L95)

**`Beta`**

Exact session identifier for the agent running in this terminal, when one
could be determined. Present only when an opt-in `SessionStart` hook has
reported it (see the Settings → Agents page); absent otherwise — Silo
never *infers* a session id by directory/recency, since that can silently
resolve to the wrong session. Populated live once the hook fires (not
deferred to death), then persisted, so a consumer reacting to
`activity === "dead"` can read it back.

***

### resumeCommand?

```ts
readonly optional resumeCommand?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:104](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L104)

**`Beta`**

A ready-to-show (and copy/paste) resume hint. Either an exact
`"claude --resume 01abc..."` (when [AgentInfo.sessionId](#sessionid) was
resolved via a hook) or an honest, session-id-less
`"was running claude in ~/foo"` note (when it wasn't). Attached the first
time the terminal's agent is detected and persisted, so it is available
both live and at `activity === "dead"`.

***

### agentName?

```ts
readonly optional agentName?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:113](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L113)

**`Beta`**

Human-readable agent name, e.g. `"Claude Code"` or `"Codex CLI"`. Tells
you *which* agent CLI is running in this terminal, independent of
whether an exact session id was ever resolved — populated as soon as a
known agent leader is detected at all (same moment
[AgentInfo.resumeCommand](#resumecommand) is first attached), not deferred until
[AgentInfo.sessionId](#sessionid) is available.

***

### agentId?

```ts
readonly optional agentId?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:121](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L121)

**`Beta`**

Stable catalog key for the agent, e.g. `"claude"` or `"codex"` — unlike
[AgentInfo.agentName](#agentname) (a display string meant for showing to the
user), this is meant for an extension's own code to switch or compare
on, and won't change if the display name is ever reworded. Populated at
the same moment and lifecycle as `agentName`.
