# Interface: AgentSessionConfigChoice

Defined in: [packages/sdk/src/agents-service.ts:1043](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1043)

**`Beta`**

One selectable value inside an [AgentSessionConfigOption](AgentSessionConfigOption.md).

## Properties

### value

```ts
readonly value: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1045](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1045)

**`Beta`**

The value to pass to [AgentSessionHandle.setConfigOption](AgentSessionHandle.md#setconfigoption).

***

### name

```ts
readonly name: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1047](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1047)

**`Beta`**

Label to show, e.g. `"Claude Sonnet"`, `"Plan"`.

***

### description?

```ts
readonly optional description?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1049](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1049)

**`Beta`**

A longer explanation, when the agent gave one.
