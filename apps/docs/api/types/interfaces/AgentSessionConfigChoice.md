# Interface: AgentSessionConfigChoice

Defined in: [packages/sdk/src/agents-service.ts:1490](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1490)

**`Beta`**

One selectable value inside an [AgentSessionConfigOption](AgentSessionConfigOption.md).

## Properties

### value

```ts
readonly value: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1492](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1492)

**`Beta`**

The value to pass to [AgentSessionHandle.setConfigOption](AgentSessionHandle.md#setconfigoption).

***

### name

```ts
readonly name: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1494](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1494)

**`Beta`**

Label to show, e.g. `"Claude Sonnet"`, `"Plan"`.

***

### description?

```ts
readonly optional description?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1496](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1496)

**`Beta`**

A longer explanation, when the agent gave one.
