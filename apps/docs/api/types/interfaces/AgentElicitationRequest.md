# Interface: AgentElicitationRequest

Defined in: [packages/sdk/src/agents-service.ts:1522](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1522)

**`Beta`**

The agent is **blocked on the user**: it is asking a structured question and
the turn will not proceed until one of [respond](#respond), [decline](#decline) or
[cancel](#cancel) is called. Delivered to
[AgentSessionHandle.onElicitation](AgentSessionHandle.md#onelicitation) (RFC 0062).

This is the richer sibling of [AgentPermissionRequest](AgentPermissionRequest.md) — several
questions in one ask, multi-select answers, per-question free text — and it
is what Claude's `AskUserQuestion` tool becomes. The surface is the
**parsed questions**, not the raw JSON Schema, so a chat UI never has to
reimplement the schema subset; `raw` is there for one that wants more.

Auto-accept behavior is deliberately **not** extended to questions (RFC
0047 is permission-only): there is no safe answer to invent, and guessing
would put words in the user's mouth and record them as the tool's answer.

If no `onElicitation` listener is registered, Silo answers `cancel` on the
extension's behalf so the agent is never left hanging.

## Properties

### id

```ts
readonly id: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1529](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1529)

**`Beta`**

Identifies this request within its session — the id the matching
[AgentElicitationRecord](AgentElicitationRecord.md) is journaled under. A UI that renders both
the live card and the transcript row joins them on this, so one question
is never drawn twice.

***

### message

```ts
readonly message: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1532](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1532)

**`Beta`**

The human-readable ask. For a single-question form this *is* the
 question, and the question's `prompt` repeats it.

***

### questions

```ts
readonly questions: readonly AgentElicitationQuestion[];
```

Defined in: [packages/sdk/src/agents-service.ts:1534](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1534)

**`Beta`**

The questions to put to the user, in the agent's order.

***

### acknowledgeOnly

```ts
readonly acknowledgeOnly: boolean;
```

Defined in: [packages/sdk/src/agents-service.ts:1540](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1540)

**`Beta`**

True when the agent's schema named no fields: show [message](#message) with
accept / decline / cancel and **no input**. Not a parse failure — with no
field to answer, an empty answer is the complete and correct reply.

***

### toolCallId?

```ts
readonly optional toolCallId?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1543](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1543)

**`Beta`**

The tool call this question belongs to, when the agent sent one — the
 same id as the matching [AgentToolCall.toolCallId](AgentToolCall.md#toolcallid).

***

### raw

```ts
readonly raw: Readonly<Record<string, unknown>>;
```

Defined in: [packages/sdk/src/agents-service.ts:1546](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1546)

**`Beta`**

The raw Agent Client Protocol `elicitation/create` params, including
 anything the parsed model above does not name.

## Methods

### respond()

```ts
respond(answers): void;
```

Defined in: [packages/sdk/src/agents-service.ts:1555](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1555)

**`Beta`**

Accept with the collected answers, keyed by
[AgentElicitationQuestion.id](AgentElicitationQuestion.md#id). Silo coerces each answer to the type
the agent declared and routes custom answers to their own field.

Idempotent, and mutually exclusive with [decline](#decline) / [cancel](#cancel) —
the first call wins and later ones are ignored.

#### Parameters

##### answers

`Readonly`\<`Record`\<`string`, [`AgentElicitationAnswer`](AgentElicitationAnswer.md)\>\>

#### Returns

`void`

***

### decline()

```ts
decline(): void;
```

Defined in: [packages/sdk/src/agents-service.ts:1561](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1561)

**`Beta`**

The user chose to **skip**. The agent is told so and the turn continues —
`claude-agent-acp` hands the model empty answers. This is the user's
decision, never Silo's.

#### Returns

`void`

***

### cancel()

```ts
cancel(): void;
```

Defined in: [packages/sdk/src/agents-service.ts:1567](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1567)

**`Beta`**

Abort the tool call the question belongs to. Stronger than
[decline](#decline): the agent gives up on the call rather than continuing
without an answer.

#### Returns

`void`
