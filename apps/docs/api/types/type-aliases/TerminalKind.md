# Type Alias: TerminalKind

```ts
type TerminalKind = "shell" | "claude" | "pi";
```

Defined in: [packages/sdk/src/domain-types.ts:28](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L28)

The kind of a terminal session.

## Remarks

The `"claude"` and `"pi"` values are **deprecated** (RFC 0033). Nothing in
Silo creates a terminal with those kinds any more, and a persisted record
carrying one is normalized to `"shell"` at load. Use an **Agent Profile** to
start an agent in a terminal — it is the launch-time vocabulary for "which
agent"; `TerminalKind` is neither the launch nor the identity vocabulary.
`ctx.terminals.create({ kind: "claude" | "pi" })` still works (it creates a
`"shell"` terminal and launches a matching profile if one exists), and the
type keeps both values so third-party code compiles — removal is gated on a
later engine bump.
