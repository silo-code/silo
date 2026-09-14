# Interface: AgentSessionConfigChoice

Defined in: [packages/sdk/src/agents-service.ts:891](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L891)

**`Beta`**

One selectable value inside an [AgentSessionConfigOption](AgentSessionConfigOption.md).

## Properties

### value

```ts
readonly value: string;
```

Defined in: [packages/sdk/src/agents-service.ts:893](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L893)

**`Beta`**

The value to pass to [AgentSessionHandle.setConfigOption](AgentSessionHandle.md#setconfigoption).

***

### name

```ts
readonly name: string;
```

Defined in: [packages/sdk/src/agents-service.ts:895](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L895)

**`Beta`**

Label to show, e.g. `"Claude Sonnet"`, `"Plan"`.

***

### description?

```ts
readonly optional description?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:897](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L897)

**`Beta`**

A longer explanation, when the agent gave one.
