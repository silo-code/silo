# Interface: AgentSessionConfigChoice

Defined in: [packages/sdk/src/agents-service.ts:992](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L992)

**`Beta`**

One selectable value inside an [AgentSessionConfigOption](AgentSessionConfigOption.md).

## Properties

### value

```ts
readonly value: string;
```

Defined in: [packages/sdk/src/agents-service.ts:994](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L994)

**`Beta`**

The value to pass to [AgentSessionHandle.setConfigOption](AgentSessionHandle.md#setconfigoption).

***

### name

```ts
readonly name: string;
```

Defined in: [packages/sdk/src/agents-service.ts:996](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L996)

**`Beta`**

Label to show, e.g. `"Claude Sonnet"`, `"Plan"`.

***

### description?

```ts
readonly optional description?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:998](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L998)

**`Beta`**

A longer explanation, when the agent gave one.
