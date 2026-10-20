# Interface: AgentSessionConfigChoice

Defined in: [packages/sdk/src/agents-service.ts:1577](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1577)

**`Beta`**

One selectable value inside an [AgentSessionConfigOption](AgentSessionConfigOption.md).

## Properties

### value

```ts
readonly value: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1579](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1579)

**`Beta`**

The value to pass to [AgentSessionHandle.setConfigOption](AgentSessionHandle.md#setconfigoption).

***

### name

```ts
readonly name: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1581](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1581)

**`Beta`**

Label to show, e.g. `"Claude Sonnet"`, `"Plan"`.

***

### description?

```ts
readonly optional description?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1583](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1583)

**`Beta`**

A longer explanation, when the agent gave one.
