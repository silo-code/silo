# Type Alias: AgentActivity

```ts
type AgentActivity = "none" | "working" | "idle" | "error" | "dead";
```

Defined in: [packages/sdk/src/agents-service.ts:29](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L29)

**`Beta`**

What a terminal's agent is currently doing, as classified by the host from
OSC/output signals. `"none"` means no agent activity has been observed
(including plain, non-agent shells). `"idle"` means the agent finished its
last turn and is waiting for the next input — this is purely a fact about
the agent itself, independent of whether anyone is looking at the
terminal; see [AgentInfo.needsAttention](../interfaces/AgentInfo.md#needsattention) for the separate "has a
human seen this" signal (an earlier design conflated the two into a
`"waiting"`/`"done"` split on `activity` itself — dropped once it turned
out to carry no information `needsAttention` didn't already have).
`"dead"` is distinct from a merely `stale` restored state — see
[AgentInfo.stale](../interfaces/AgentInfo.md#stale) — and means the terminal's backend was confirmed
gone (no daemon to reattach to) after an unclean shutdown; nothing will
arrive to resolve this on its own.
