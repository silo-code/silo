# Interface: AgentSessionConfigChoice

Defined in: [packages/sdk/src/agents-service.ts:928](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L928)

**`Beta`**

One selectable value inside an [AgentSessionConfigOption](AgentSessionConfigOption.md).

## Properties

### value

```ts
readonly value: string;
```

Defined in: [packages/sdk/src/agents-service.ts:930](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L930)

**`Beta`**

The value to pass to [AgentSessionHandle.setConfigOption](AgentSessionHandle.md#setconfigoption).

***

### name

```ts
readonly name: string;
```

Defined in: [packages/sdk/src/agents-service.ts:932](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L932)

**`Beta`**

Label to show, e.g. `"Claude Sonnet"`, `"Plan"`.

***

### description?

```ts
readonly optional description?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:934](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L934)

**`Beta`**

A longer explanation, when the agent gave one.
