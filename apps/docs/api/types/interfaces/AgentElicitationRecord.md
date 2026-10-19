# Interface: AgentElicitationRecord

Defined in: [packages/sdk/src/agents-service.ts:1470](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1470)

**`Beta`**

A question the agent asked, as a **durable transcript row** rather than a
live request — [AgentElicitationRequest](AgentElicitationRequest.md) with every callable member
removed, which is precisely what can be written down.

Carried on [AgentSessionUpdate.elicitation](AgentSessionUpdate.md#elicitation) for the Silo-synthesized
`"elicitation"` and `"elicitation_resolution"` kinds, so a Chat UI can
repaint a question it can no longer *answer* — a resumed session has no
pending request — and say honestly how it ended. Without this a reload left
the transcript ending mid-air, with no sign the turn had been waiting on the
user at all.

On an `"elicitation_resolution"` update only [id](#id) and
[resolution](#resolution) are meaningful: it patches the row the `"elicitation"`
update opened.

## Properties

### id

```ts
readonly id: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1473](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1473)

**`Beta`**

Correlates the two updates, and a live
 [AgentElicitationRequest.id](AgentElicitationRequest.md#id) with its row. Unique per session.

***

### message?

```ts
readonly optional message?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1475](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1475)

**`Beta`**

The human-readable ask — [AgentElicitationRequest.message](AgentElicitationRequest.md#message).

***

### questions?

```ts
readonly optional questions?: readonly AgentElicitationQuestion[];
```

Defined in: [packages/sdk/src/agents-service.ts:1477](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1477)

**`Beta`**

The questions as they were put to the user.

***

### acknowledgeOnly?

```ts
readonly optional acknowledgeOnly?: boolean;
```

Defined in: [packages/sdk/src/agents-service.ts:1479](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1479)

**`Beta`**

[AgentElicitationRequest.acknowledgeOnly](AgentElicitationRequest.md#acknowledgeonly), as asked.

***

### toolCallId?

```ts
readonly optional toolCallId?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1481](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1481)

**`Beta`**

The tool call the question belonged to, when the agent sent one.

***

### resolution?

```ts
readonly optional resolution?: AgentElicitationResolution;
```

Defined in: [packages/sdk/src/agents-service.ts:1484](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1484)

**`Beta`**

How it ended. `undefined` on the opening `"elicitation"` update — the
 question was still open at that point.
