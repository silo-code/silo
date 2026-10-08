# Type Alias: AgentDelegationState

```ts
type AgentDelegationState = "started" | "completed" | "failed" | "cancelled" | "disconnected";
```

Defined in: [packages/sdk/src/agents-service.ts:870](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L870)

**`Beta`**

The lifecycle state of one delegated worker, as its own agent reports it.

`"started"` means the worker exists and is working. The other four are
**terminal**: nothing further arrives for that subagent, and a UI may say
so permanently. They are distinguished because they are not the same news —
`"completed"` is a result, `"failed"` is an error worth surfacing, and
`"disconnected"` means nobody knows how it ended.

Tolerate the set growing: an agent reporting a state this union does not
name produces no [AgentDelegation](../interfaces/AgentDelegation.md) at all rather than a guess, so a
consumer never sees a value outside it.
