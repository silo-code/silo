# Interface: AgentElicitationCustomAnswer

Defined in: [packages/sdk/src/agents-service.ts:1367](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1367)

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

Defined in: [packages/sdk/src/agents-service.ts:1370](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1370)

**`Beta`**

The field the typed answer is sent under. Rarely needed — pass custom
 text as [AgentElicitationAnswer.custom](AgentElicitationAnswer.md#custom) and Silo routes it.

***

### label?

```ts
readonly optional label?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1372](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1372)

**`Beta`**

The box's label, e.g. `"Other"`.

***

### description?

```ts
readonly optional description?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1374](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1374)

**`Beta`**

Longer helper text, when the agent gave one.
