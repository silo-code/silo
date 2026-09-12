# Interface: AgentSessionConnectOptions

Defined in: [packages/sdk/src/agents-service.ts:1075](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1075)

**`Beta`**

Options for [AgentSessionsService.connect](AgentSessionsService.md#connect).

## Properties

### cwd?

```ts
optional cwd?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1077](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1077)

**`Beta`**

Working directory for the agent. Defaults to the workspace folder.

***

### workspaceId?

```ts
optional workspaceId?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1080](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1080)

**`Beta`**

Which workspace the session belongs to (for
 [AgentInfo.workspaceId](AgentInfo.md#workspaceid) and `reveal`). Defaults to the active one.

***

### title?

```ts
optional title?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1098](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1098)

**`Beta`**

A last-known display title, shown immediately with [resume](#resume) — before
the connection (`initialize` alone can take several seconds) or a
`session/resume` / `session/load` round trip resolves. Without it, a
restoring session's dock tab, workspace row, and Agents navigator entry
fall back to the profile's plain label for however long reconnecting
takes, even when the agent volunteered a real title before the app
closed. It **outlives the handshake**: it is still the session's title
once the connection is up, until the agent volunteers a real one of its
own (a `session_info_update`). The agent's product name from `initialize`
(`agentInfo.title`, e.g. "Claude Agent") does *not* supersede it — that is
the fallback for a session that has never had a title, not a replacement
for one this conversation already earned. Persist whatever
[AgentInfo.title](AgentInfo.md#title) last was and pass it back here on the next
restore. Ignored without [resume](#resume) — a fresh session has no prior
title to show early.

***

### reveal?

```ts
optional reveal?: () => void;
```

Defined in: [packages/sdk/src/agents-service.ts:1116](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1116)

**`Beta`**

How to bring **your** UI for this session into view. Silo calls this from
[AgentsService.reveal](AgentsService.md#reveal) — after activating the session's workspace —
so a kind-agnostic caller (the Agents navigator, a notification, a
command) can focus a Chat session's transcript without knowing that a
transcript is what it is.

Implement it with whatever "come to the front" means for your surface: a
dock panel calls `api.setActive()` on its own `DockPanelApi`, a side
panel reveals itself through `ctx.layout`. Called on the main thread,
possibly more than once; keep it cheap and idempotent, and expect it after
an `await` — capture the handle you need in a ref rather than closing over
render-scoped state.

Omit it and `reveal(id)` still activates the workspace, which is all Silo
can honestly do for a session whose UI it does not own.

#### Returns

`void`

***

### resume?

```ts
optional resume?: AgentSessionRestore;
```

Defined in: [packages/sdk/src/agents-service.ts:1129](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1129)

**`Beta`**

Reconnect a previously-persisted session instead of starting a fresh one
— Chat session resurrection (RFC 0042). Pass the [AgentSessionHandle.sessionId](AgentSessionHandle.md#sessionid) a prior `connect()` on this same profile
returned (what a recorded panel keeps in its `DockPanelState`).

`connect()` never rejects because the target has gone stale: it probes
`session/resume` and `session/load` separately (`resume` wins when both
are advertised), and falls through to a fresh `session/new` if neither
works and there is no journal to fall back to. See [AgentSessionHandle.resumeOutcome](AgentSessionHandle.md#resumeoutcome) for which path was taken.
