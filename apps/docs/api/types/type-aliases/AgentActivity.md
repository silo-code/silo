# Type Alias: AgentActivity

```ts
type AgentActivity = "none" | "working" | "waiting" | "done" | "error" | "dead";
```

Defined in: [packages/sdk/src/agents-service.ts:22](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L22)

**`Beta`**

What a terminal's agent is currently doing, as classified by the host from
OSC/output signals. `"none"` means no agent activity has been observed
(including plain, non-agent shells). `"dead"` is distinct from a merely
`stale` restored state — see [AgentInfo.stale](../interfaces/AgentInfo.md#stale) — and means the
terminal's backend was confirmed gone (no daemon to reattach to) after an
unclean shutdown; nothing will arrive to resolve this on its own.
