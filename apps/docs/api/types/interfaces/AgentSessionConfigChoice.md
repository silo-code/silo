# Interface: AgentSessionConfigChoice

Defined in: [packages/sdk/src/agents-service.ts:859](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L859)

**`Beta`**

One selectable value inside an [AgentSessionConfigOption](AgentSessionConfigOption.md).

## Properties

### value

```ts
readonly value: string;
```

Defined in: [packages/sdk/src/agents-service.ts:861](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L861)

**`Beta`**

The value to pass to [AgentSessionHandle.setConfigOption](AgentSessionHandle.md#setconfigoption).

***

### name

```ts
readonly name: string;
```

Defined in: [packages/sdk/src/agents-service.ts:863](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L863)

**`Beta`**

Label to show, e.g. `"Claude Sonnet"`, `"Plan"`.

***

### description?

```ts
readonly optional description?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:865](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L865)

**`Beta`**

A longer explanation, when the agent gave one.
