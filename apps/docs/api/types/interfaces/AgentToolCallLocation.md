# Interface: AgentToolCallLocation

Defined in: [packages/sdk/src/agents-service.ts:589](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L589)

**`Beta`**

A file (and optionally a line) a tool call touches — the protocol's
`locations`, which is how an agent says "this call is about _this_ file"
independently of its title. A Chat UI can turn these into "open the file"
affordances.

Both agents probed on 2026-09-08 send it; only `claude-agent-acp` 0.75.1 was
seen sending `line`.

## Properties

### path

```ts
readonly path: string;
```

Defined in: [packages/sdk/src/agents-service.ts:591](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L591)

**`Beta`**

Absolute path to the file.

***

### line?

```ts
readonly optional line?: number;
```

Defined in: [packages/sdk/src/agents-service.ts:593](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L593)

**`Beta`**

1-based line the call is focused on, when the agent named one.
