# Interface: AgentSessionConfigChoice

Defined in: [packages/sdk/src/agents-service.ts:1169](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1169)

**`Beta`**

One selectable value inside an [AgentSessionConfigOption](AgentSessionConfigOption.md).

## Properties

### value

```ts
readonly value: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1171](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1171)

**`Beta`**

The value to pass to [AgentSessionHandle.setConfigOption](AgentSessionHandle.md#setconfigoption).

***

### name

```ts
readonly name: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1173](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1173)

**`Beta`**

Label to show, e.g. `"Claude Sonnet"`, `"Plan"`.

***

### description?

```ts
readonly optional description?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1175](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1175)

**`Beta`**

A longer explanation, when the agent gave one.
