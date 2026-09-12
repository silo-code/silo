# Interface: AgentSessionConfigChoice

Defined in: [packages/sdk/src/agents-service.ts:813](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L813)

**`Beta`**

One selectable value inside an [AgentSessionConfigOption](AgentSessionConfigOption.md).

## Properties

### value

```ts
readonly value: string;
```

Defined in: [packages/sdk/src/agents-service.ts:815](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L815)

**`Beta`**

The value to pass to [AgentSessionHandle.setConfigOption](AgentSessionHandle.md#setconfigoption).

***

### name

```ts
readonly name: string;
```

Defined in: [packages/sdk/src/agents-service.ts:817](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L817)

**`Beta`**

Label to show, e.g. `"Claude Sonnet"`, `"Plan"`.

***

### description?

```ts
readonly optional description?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:819](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L819)

**`Beta`**

A longer explanation, when the agent gave one.
