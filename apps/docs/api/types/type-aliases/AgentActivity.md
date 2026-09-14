# Type Alias: AgentActivity

```ts
type AgentActivity = "none" | "working" | "blocked" | "idle" | "error" | "dead";
```

Defined in: [packages/sdk/src/agents-service.ts:39](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L39)

**`Beta`**

What an agent is currently doing — classified by the host from OSC/output
signals for a terminal-kind session, or reported directly by the protocol
for a chat-kind one. `"none"` means no agent activity has been observed
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

`"blocked"` (chat-kind only) is a turn suspended on
[AgentSessionHandle.onPermission](../interfaces/AgentSessionHandle.md#onpermission) — a concrete, protocol-reported
question, not the inferred "no output for a while" guess `"idle"` is. It
does not repeat the earlier `"waiting"` mistake: unlike a merely-idle
agent, it stays `"blocked"` even while its own session is the one on
screen, since "the agent needs you to answer something" is worth showing
regardless of whether you are already looking — where `needsAttention`
exists to be suppressed exactly then.
