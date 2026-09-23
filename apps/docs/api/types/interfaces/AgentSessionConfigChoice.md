# Interface: AgentSessionConfigChoice

Defined in: [packages/sdk/src/agents-service.ts:947](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L947)

**`Beta`**

One selectable value inside an [AgentSessionConfigOption](AgentSessionConfigOption.md).

## Properties

### value

```ts
readonly value: string;
```

Defined in: [packages/sdk/src/agents-service.ts:949](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L949)

**`Beta`**

The value to pass to [AgentSessionHandle.setConfigOption](AgentSessionHandle.md#setconfigoption).

***

### name

```ts
readonly name: string;
```

Defined in: [packages/sdk/src/agents-service.ts:951](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L951)

**`Beta`**

Label to show, e.g. `"Claude Sonnet"`, `"Plan"`.

***

### description?

```ts
readonly optional description?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:953](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L953)

**`Beta`**

A longer explanation, when the agent gave one.
