# Interface: AgentPlanEntry

Defined in: [packages/sdk/src/agents-service.ts:1054](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1054)

**`Beta`**

One row of the agent's plan — the protocol's `plan` update entry.

## Properties

### content

```ts
readonly content: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1056](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1056)

**`Beta`**

What the step is, in the agent's words.

***

### status?

```ts
readonly optional status?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1058](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1058)

**`Beta`**

`"pending"`, `"in_progress"`, `"completed"`, or a vendor's own.

***

### priority?

```ts
readonly optional priority?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1061](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1061)

**`Beta`**

`"high"`, `"medium"`, `"low"`, or a vendor's own, when the agent ranked
 the step.
