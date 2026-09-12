# Interface: AgentSessionConfigChoice

Defined in: [packages/sdk/src/agents-service.ts:582](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L582)

**`Beta`**

One selectable value inside an [AgentSessionConfigOption](AgentSessionConfigOption.md).

## Properties

### value

```ts
readonly value: string;
```

Defined in: [packages/sdk/src/agents-service.ts:584](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L584)

**`Beta`**

The value to pass to [AgentSessionHandle.setConfigOption](AgentSessionHandle.md#setconfigoption).

***

### name

```ts
readonly name: string;
```

Defined in: [packages/sdk/src/agents-service.ts:586](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L586)

**`Beta`**

Label to show, e.g. `"Claude Sonnet"`, `"Plan"`.

***

### description?

```ts
readonly optional description?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:588](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L588)

**`Beta`**

A longer explanation, when the agent gave one.
