# Interface: AgentPlanEntry

Defined in: [packages/sdk/src/agents-service.ts:739](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L739)

**`Beta`**

One row of the agent's plan — the protocol's `plan` update entry.

## Properties

### content

```ts
readonly content: string;
```

Defined in: [packages/sdk/src/agents-service.ts:741](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L741)

**`Beta`**

What the step is, in the agent's words.

***

### status?

```ts
readonly optional status?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:743](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L743)

**`Beta`**

`"pending"`, `"in_progress"`, `"completed"`, or a vendor's own.

***

### priority?

```ts
readonly optional priority?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:746](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L746)

**`Beta`**

`"high"`, `"medium"`, `"low"`, or a vendor's own, when the agent ranked
 the step.
