# Interface: AgentSessionConfigChoice

Defined in: [packages/sdk/src/agents-service.ts:1042](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1042)

**`Beta`**

One selectable value inside an [AgentSessionConfigOption](AgentSessionConfigOption.md).

## Properties

### value

```ts
readonly value: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1044](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1044)

**`Beta`**

The value to pass to [AgentSessionHandle.setConfigOption](AgentSessionHandle.md#setconfigoption).

***

### name

```ts
readonly name: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1046](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1046)

**`Beta`**

Label to show, e.g. `"Claude Sonnet"`, `"Plan"`.

***

### description?

```ts
readonly optional description?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1048](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1048)

**`Beta`**

A longer explanation, when the agent gave one.
