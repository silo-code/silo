# Interface: AgentSessionConfigChoice

Defined in: [packages/sdk/src/agents-service.ts:961](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L961)

**`Beta`**

One selectable value inside an [AgentSessionConfigOption](AgentSessionConfigOption.md).

## Properties

### value

```ts
readonly value: string;
```

Defined in: [packages/sdk/src/agents-service.ts:963](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L963)

**`Beta`**

The value to pass to [AgentSessionHandle.setConfigOption](AgentSessionHandle.md#setconfigoption).

***

### name

```ts
readonly name: string;
```

Defined in: [packages/sdk/src/agents-service.ts:965](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L965)

**`Beta`**

Label to show, e.g. `"Claude Sonnet"`, `"Plan"`.

***

### description?

```ts
readonly optional description?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:967](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L967)

**`Beta`**

A longer explanation, when the agent gave one.
