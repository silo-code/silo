# Interface: AgentSessionConfigChoice

Defined in: [packages/sdk/src/agents-service.ts:1308](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1308)

**`Beta`**

One selectable value inside an [AgentSessionConfigOption](AgentSessionConfigOption.md).

## Properties

### value

```ts
readonly value: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1310](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1310)

**`Beta`**

The value to pass to [AgentSessionHandle.setConfigOption](AgentSessionHandle.md#setconfigoption).

***

### name

```ts
readonly name: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1312](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1312)

**`Beta`**

Label to show, e.g. `"Claude Sonnet"`, `"Plan"`.

***

### description?

```ts
readonly optional description?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1314](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1314)

**`Beta`**

A longer explanation, when the agent gave one.
