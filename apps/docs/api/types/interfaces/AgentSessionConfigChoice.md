# Interface: AgentSessionConfigChoice

Defined in: [packages/sdk/src/agents-service.ts:875](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L875)

**`Beta`**

One selectable value inside an [AgentSessionConfigOption](AgentSessionConfigOption.md).

## Properties

### value

```ts
readonly value: string;
```

Defined in: [packages/sdk/src/agents-service.ts:877](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L877)

**`Beta`**

The value to pass to [AgentSessionHandle.setConfigOption](AgentSessionHandle.md#setconfigoption).

***

### name

```ts
readonly name: string;
```

Defined in: [packages/sdk/src/agents-service.ts:879](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L879)

**`Beta`**

Label to show, e.g. `"Claude Sonnet"`, `"Plan"`.

***

### description?

```ts
readonly optional description?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:881](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L881)

**`Beta`**

A longer explanation, when the agent gave one.
