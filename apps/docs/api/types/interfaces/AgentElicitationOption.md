# Interface: AgentElicitationOption

Defined in: [packages/sdk/src/agents-service.ts:1325](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1325)

**`Beta`**

One choice in an [AgentElicitationQuestion](AgentElicitationQuestion.md) of kind `"select"` or
`"multi-select"`.

## Properties

### value

```ts
readonly value: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1327](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1327)

**`Beta`**

The value to send back as the answer.

***

### label

```ts
readonly label: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1330](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1330)

**`Beta`**

What to show the user. Falls back to [value](#value) when the agent gave
 no separate label.

***

### description?

```ts
readonly optional description?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1332](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1332)

**`Beta`**

Secondary text, when the agent supplied one.
