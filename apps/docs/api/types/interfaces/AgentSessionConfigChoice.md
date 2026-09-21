# Interface: AgentSessionConfigChoice

Defined in: [packages/sdk/src/agents-service.ts:901](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L901)

**`Beta`**

One selectable value inside an [AgentSessionConfigOption](AgentSessionConfigOption.md).

## Properties

### value

```ts
readonly value: string;
```

Defined in: [packages/sdk/src/agents-service.ts:903](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L903)

**`Beta`**

The value to pass to [AgentSessionHandle.setConfigOption](AgentSessionHandle.md#setconfigoption).

***

### name

```ts
readonly name: string;
```

Defined in: [packages/sdk/src/agents-service.ts:905](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L905)

**`Beta`**

Label to show, e.g. `"Claude Sonnet"`, `"Plan"`.

***

### description?

```ts
readonly optional description?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:907](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L907)

**`Beta`**

A longer explanation, when the agent gave one.
