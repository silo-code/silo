# Interface: AgentSessionRestore

Defined in: [packages/sdk/src/agents-service.ts:1238](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1238)

**`Beta`**

A restore target for [AgentSessionConnectOptions.resume](AgentSessionConnectOptions.md#resume) — Chat
session resurrection (RFC 0042).

## Properties

### sessionId

```ts
sessionId: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1243](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1243)

**`Beta`**

The session id to reconnect — an earlier connection's [AgentSessionHandle.sessionId](AgentSessionHandle.md#sessionid).

***

### startFresh?

```ts
optional startFresh?: boolean;
```

Defined in: [packages/sdk/src/agents-service.ts:1257](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1257)

**`Beta`**

Skip probing `session/resume` / `session/load` and start a fresh
`session/new` directly, carrying the **transcript journal** kept under
[sessionId](#sessionid) into the new session's — "Continue in a new session"
from a `"journal-only"` [AgentSessionHandle.resumeOutcome](AgentSessionHandle.md#resumeoutcome). The new
handle's [AgentSessionHandle.sessionId](AgentSessionHandle.md#sessionid) is whatever `session/new`
mints, **not** this `sessionId` — persist that returned id for the next
restore, exactly as after a plain `connect()`. Keeping the original,
already-known-unresumable id instead would mean every future restore
keeps retrying an id the agent will never resume, forever, even while the
new conversation itself works fine turn after turn (found live,
2026-09-09).
