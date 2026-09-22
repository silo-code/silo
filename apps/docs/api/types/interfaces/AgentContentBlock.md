# Interface: AgentContentBlock

Defined in: [packages/sdk/src/agents-service.ts:613](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L613)

**`Beta`**

One piece of agent-authored content — the Agent Client Protocol content
block, which appears both in a streamed message chunk
([AgentSessionUpdate.content](AgentSessionUpdate.md#content)) and inside a tool call's output
([AgentToolCallContent.content](AgentToolCallContent.md#content)).

**`type` is deliberately a `string`, not a union.** The protocol names
`"text"`, `"image"`, `"audio"`, `"resource_link"` and `"resource"`, and a
vendor may add its own; the same tolerance rule the rest of this surface
follows applies — render the types you know and **name, rather than drop**,
one you do not, so a transcript never silently loses a block.

Every field but `type` is optional because which ones arrive depends on the
type _and_ the agent: only `"text"` blocks were seen from Cursor
(2026.09.02) and `claude-agent-acp` (0.75.1) in the 2026-09-08 probe, so
treat the rest as modelled-but-unverified and check before you read.

## Properties

### type

```ts
readonly type: string;
```

Defined in: [packages/sdk/src/agents-service.ts:616](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L616)

**`Beta`**

The protocol's block type — `"text"`, `"image"`, `"audio"`,
 `"resource_link"`, `"resource"`, or a vendor's own.

***

### text?

```ts
readonly optional text?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:618](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L618)

**`Beta`**

The text, for a `"text"` block.

***

### mimeType?

```ts
readonly optional mimeType?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:620](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L620)

**`Beta`**

MIME type, for an `"image"` / `"audio"` / `"resource_link"` block.

***

### uri?

```ts
readonly optional uri?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:623](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L623)

**`Beta`**

Where the content lives, for a `"resource_link"` (or an image given by
 reference rather than inline). Typically a `file://` URI.

***

### name?

```ts
readonly optional name?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:625](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L625)

**`Beta`**

A short display name, for a `"resource_link"`.
