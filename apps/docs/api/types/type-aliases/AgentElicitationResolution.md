# Type Alias: AgentElicitationResolution

```ts
type AgentElicitationResolution = "answered" | "skipped" | "cancelled" | "interrupted";
```

Defined in: [packages/sdk/src/agents-service.ts:1444](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1444)

**`Beta`**

How an [AgentElicitationRequest](../interfaces/AgentElicitationRequest.md) ended.

`"interrupted"` is the one Silo itself writes rather than the user: the
question was still open when the session went away — a webview reload, an
app restart, a torn-down panel — so no answer ever reached the agent. It is
a fact about the *conversation*, which is why it is recorded in the
transcript journal and survives a restore (RFC 0062).
