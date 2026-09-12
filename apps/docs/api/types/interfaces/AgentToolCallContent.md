# Interface: AgentToolCallContent

Defined in: [packages/sdk/src/agents-service.ts:619](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L619)

**`Beta`**

One block of a tool call's content — what the agent wants shown _inside_ the
tool row. The protocol wraps each in a `{ type }` envelope, and the three it
names are `"content"` (an [AgentContentBlock](AgentContentBlock.md)), `"diff"` (a file edit)
and `"terminal"` (output streaming into an agent-side terminal).

`type` is a `string` for the usual reason: tolerate what you do not know.
The remaining fields are the union's arms flattened, so check `type` before
reading them.

## Properties

### type

```ts
readonly type: string;
```

Defined in: [packages/sdk/src/agents-service.ts:621](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L621)

**`Beta`**

`"content"`, `"diff"`, `"terminal"`, or a vendor's own.

***

### content?

```ts
readonly optional content?: AgentContentBlock;
```

Defined in: [packages/sdk/src/agents-service.ts:623](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L623)

**`Beta`**

The content block, when `type` is `"content"`.

***

### path?

```ts
readonly optional path?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:625](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L625)

**`Beta`**

The file being edited, when `type` is `"diff"`.

***

### oldText?

```ts
readonly optional oldText?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:629](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L629)

**`Beta`**

The file's contents before the edit, when `type` is `"diff"`. Absent for
 a file the agent is creating — `claude-agent-acp` 0.75.1 sends `null`
 there, which arrives here as `undefined`.

***

### newText?

```ts
readonly optional newText?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:631](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L631)

**`Beta`**

The file's contents after the edit, when `type` is `"diff"`.

***

### terminalId?

```ts
readonly optional terminalId?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:635](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L635)

**`Beta`**

The agent-side terminal this call is streaming into, when `type` is
 `"terminal"`. Silo declines `terminal/*` today, so a consumer can name the
 block but cannot read its output.
