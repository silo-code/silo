# Interface: AgentSessionConfigChoice

Defined in: [packages/sdk/src/agents-service.ts:931](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L931)

**`Beta`**

One selectable value inside an [AgentSessionConfigOption](AgentSessionConfigOption.md).

## Properties

### value

```ts
readonly value: string;
```

Defined in: [packages/sdk/src/agents-service.ts:933](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L933)

**`Beta`**

The value to pass to [AgentSessionHandle.setConfigOption](AgentSessionHandle.md#setconfigoption).

***

### name

```ts
readonly name: string;
```

Defined in: [packages/sdk/src/agents-service.ts:935](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L935)

**`Beta`**

Label to show, e.g. `"Claude Sonnet"`, `"Plan"`.

***

### description?

```ts
readonly optional description?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:937](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L937)

**`Beta`**

A longer explanation, when the agent gave one.
