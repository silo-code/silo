# Type Alias: AgentBackgroundTaskState

```ts
type AgentBackgroundTaskState = "running" | "paused" | "completed" | "failed" | "stopped";
```

Defined in: [packages/sdk/src/agents-service.ts:965](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L965)

**`Beta`**

Where a **backgrounded command** is in its life.

`"running"` and `"paused"` are live; `"completed"`, `"failed"` and
`"stopped"` are terminal. `"stopped"` means something ended it early rather
than it finishing on its own.

**A terminal state can be revised, once.** An agent may publish a
best-effort terminal state and then correct it when the authoritative one
arrives — in the 2026-10-08 capture `"stopped"` and `"completed"` landed in
the same millisecond, in that order, for a command that succeeded. So a
consumer must take the **latest** terminal state, not the first; latching the
first renders a successful command as though something killed it.

Tolerate the set growing: an agent reporting a state this union does not name
produces no [AgentBackgroundTask](../interfaces/AgentBackgroundTask.md) at all rather than a guess, so a
consumer never sees a value outside it.
