# Interface: AgentElicitationCustomAnswer

Defined in: [packages/sdk/src/agents-service.ts:1355](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1355)

**`Beta`**

The free-text "Other" box belonging to one question — present when the agent
paired one with it, as Claude's `AskUserQuestion` bridge does for every
question it asks.

A typed custom answer **overrides** the selection: that is the agent's own
precedence rule, applied for you by
[AgentElicitationRequest.respond](AgentElicitationRequest.md#respond).

## Properties

### field

```ts
readonly field: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1358](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1358)

**`Beta`**

The field the typed answer is sent under. Rarely needed — pass custom
 text as [AgentElicitationAnswer.custom](AgentElicitationAnswer.md#custom) and Silo routes it.

***

### label?

```ts
readonly optional label?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1360](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1360)

**`Beta`**

The box's label, e.g. `"Other"`.

***

### description?

```ts
readonly optional description?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1362](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1362)

**`Beta`**

Longer helper text, when the agent gave one.
