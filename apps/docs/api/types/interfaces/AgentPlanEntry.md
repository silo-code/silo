# Interface: AgentPlanEntry

Defined in: [packages/sdk/src/agents-service.ts:758](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L758)

**`Beta`**

One row of the agent's plan — the protocol's `plan` update entry.

## Properties

### content

```ts
readonly content: string;
```

Defined in: [packages/sdk/src/agents-service.ts:760](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L760)

**`Beta`**

What the step is, in the agent's words.

***

### status?

```ts
readonly optional status?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:762](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L762)

**`Beta`**

`"pending"`, `"in_progress"`, `"completed"`, or a vendor's own.

***

### priority?

```ts
readonly optional priority?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:765](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L765)

**`Beta`**

`"high"`, `"medium"`, `"low"`, or a vendor's own, when the agent ranked
 the step.
