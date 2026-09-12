# Type Alias: AgentStopReason

```ts
type AgentStopReason = 
  | "end_turn"
  | "max_tokens"
  | "max_turn_requests"
  | "refusal"
  | "cancelled";
```

Defined in: [packages/sdk/src/agents-service.ts:487](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L487)

**`Beta`**

Why a prompt turn ended, straight from the agent's Agent Client Protocol
stop reason. `"end_turn"` is the normal completion; `"max_tokens"` /
`"max_turn_requests"` are budget cutoffs; `"refusal"` means the agent
declined the request; `"cancelled"` follows [AgentSessionHandle.cancel](../interfaces/AgentSessionHandle.md#cancel).
