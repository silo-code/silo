# Interface: AgentSessionConfigChoice

Defined in: [packages/sdk/src/agents-service.ts:979](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L979)

**`Beta`**

One selectable value inside an [AgentSessionConfigOption](AgentSessionConfigOption.md).

## Properties

### value

```ts
readonly value: string;
```

Defined in: [packages/sdk/src/agents-service.ts:981](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L981)

**`Beta`**

The value to pass to [AgentSessionHandle.setConfigOption](AgentSessionHandle.md#setconfigoption).

***

### name

```ts
readonly name: string;
```

Defined in: [packages/sdk/src/agents-service.ts:983](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L983)

**`Beta`**

Label to show, e.g. `"Claude Sonnet"`, `"Plan"`.

***

### description?

```ts
readonly optional description?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:985](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L985)

**`Beta`**

A longer explanation, when the agent gave one.
