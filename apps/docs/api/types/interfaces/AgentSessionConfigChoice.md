# Interface: AgentSessionConfigChoice

Defined in: [packages/sdk/src/agents-service.ts:1565](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1565)

**`Beta`**

One selectable value inside an [AgentSessionConfigOption](AgentSessionConfigOption.md).

## Properties

### value

```ts
readonly value: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1567](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1567)

**`Beta`**

The value to pass to [AgentSessionHandle.setConfigOption](AgentSessionHandle.md#setconfigoption).

***

### name

```ts
readonly name: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1569](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1569)

**`Beta`**

Label to show, e.g. `"Claude Sonnet"`, `"Plan"`.

***

### description?

```ts
readonly optional description?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1571](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1571)

**`Beta`**

A longer explanation, when the agent gave one.
