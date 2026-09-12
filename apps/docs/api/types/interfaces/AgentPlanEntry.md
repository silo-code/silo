# Interface: AgentPlanEntry

Defined in: [packages/sdk/src/agents-service.ts:654](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L654)

**`Beta`**

One row of the agent's plan — the protocol's `plan` update entry.

## Properties

### content

```ts
readonly content: string;
```

Defined in: [packages/sdk/src/agents-service.ts:656](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L656)

**`Beta`**

What the step is, in the agent's words.

***

### status?

```ts
readonly optional status?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:658](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L658)

**`Beta`**

`"pending"`, `"in_progress"`, `"completed"`, or a vendor's own.

***

### priority?

```ts
readonly optional priority?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:661](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L661)

**`Beta`**

`"high"`, `"medium"`, `"low"`, or a vendor's own, when the agent ranked
 the step.
