# Interface: AgentPlanEntry

Defined in: [packages/sdk/src/agents-service.ts:840](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L840)

**`Beta`**

One row of the agent's plan — the protocol's `plan` update entry.

## Properties

### content

```ts
readonly content: string;
```

Defined in: [packages/sdk/src/agents-service.ts:842](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L842)

**`Beta`**

What the step is, in the agent's words.

***

### status?

```ts
readonly optional status?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:844](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L844)

**`Beta`**

`"pending"`, `"in_progress"`, `"completed"`, or a vendor's own.

***

### priority?

```ts
readonly optional priority?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:847](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L847)

**`Beta`**

`"high"`, `"medium"`, `"low"`, or a vendor's own, when the agent ranked
 the step.
