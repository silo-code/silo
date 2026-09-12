# Type Alias: AgentSessionKind

```ts
type AgentSessionKind = "terminal" | "chat";
```

Defined in: [packages/sdk/src/agents-service.ts:50](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L50)

**`Beta`**

Which kind of **Agent Session** an [AgentInfo](../interfaces/AgentInfo.md) describes (RFC 0038):

- `"terminal"` — the agent runs in a PTY and draws its own TUI; Silo
  *infers* what it is doing from OSC/output signals, and its identity comes
  from detection (ADR 0028).
- `"chat"` — the agent is an Agent Client Protocol child speaking structured
  JSON-RPC over piped stdio; it *reports* what it is doing and declares its
  identity at `initialize`, and Silo renders the conversation.

`ctx.agents` reports **one shape regardless of kind** — the promise is
observation parity, not capability parity. Most consumers never need to
branch on this; use [AgentsService.reveal](../interfaces/AgentsService.md#reveal) to bring a session into
view without knowing which kind it is.
