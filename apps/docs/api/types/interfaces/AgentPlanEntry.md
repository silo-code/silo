# Interface: AgentPlanEntry

Defined in: [packages/sdk/src/agents-service.ts:1050](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1050)

**`Beta`**

One row of the agent's plan — the protocol's `plan` update entry.

## Properties

### content

```ts
readonly content: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1052](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1052)

**`Beta`**

What the step is, in the agent's words.

***

### status?

```ts
readonly optional status?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1054](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1054)

**`Beta`**

`"pending"`, `"in_progress"`, `"completed"`, or a vendor's own.

***

### priority?

```ts
readonly optional priority?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1057](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1057)

**`Beta`**

`"high"`, `"medium"`, `"low"`, or a vendor's own, when the agent ranked
 the step.
