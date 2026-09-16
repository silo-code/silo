# Interface: AgentSessionRestore

Defined in: [packages/sdk/src/agents-service.ts:1269](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1269)

**`Beta`**

A restore target for [AgentSessionConnectOptions.resume](AgentSessionConnectOptions.md#resume) — Chat
session resurrection (RFC 0042).

## Properties

### sessionId

```ts
sessionId: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1274](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1274)

**`Beta`**

The session id to reconnect — an earlier connection's [AgentSessionHandle.sessionId](AgentSessionHandle.md#sessionid).

***

### startFresh?

```ts
optional startFresh?: boolean;
```

Defined in: [packages/sdk/src/agents-service.ts:1288](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1288)

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

***

### transcript?

```ts
optional transcript?: "carry" | "discard";
```

Defined in: [packages/sdk/src/agents-service.ts:1305](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1305)

**`Beta`**

What becomes of the **transcript journal** kept under [sessionId](#sessionid)
when [startFresh](#startfresh) skips straight to `session/new` (RFC 0048):

- `"carry"` (the default) — the journal moves into the new session's
  file, so the conversation continues under a working id. This is
  "Continue in a new session".
- `"discard"` — the journal is deleted and the new session starts with an
  empty one. This is **Clear**: a user asked for the conversation to be
  thrown away, agent context and transcript alike.

Read **only** alongside `startFresh`. A plain resume/load restore never
deletes a journal, whatever this says — the journal is the only record of
a session the agent can neither `resume` nor `load`, so nothing but an
explicit, user-initiated clear removes it.
