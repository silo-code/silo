# Interface: AgentElicitationQuestion

Defined in: [packages/sdk/src/agents-service.ts:1372](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1372)

**`Beta`**

One question in an [AgentElicitationRequest](AgentElicitationRequest.md).

## Properties

### id

```ts
readonly id: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1375](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1375)

**`Beta`**

Identifies the question when answering — the key in the map passed to
 [AgentElicitationRequest.respond](AgentElicitationRequest.md#respond).

***

### kind

```ts
readonly kind: AgentElicitationQuestionKind;
```

Defined in: [packages/sdk/src/agents-service.ts:1377](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1377)

**`Beta`**

Which control to render.

***

### prompt

```ts
readonly prompt: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1380](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1380)

**`Beta`**

The question to show. Never empty; for a single-question form this is
 the request's own [AgentElicitationRequest.message](AgentElicitationRequest.md#message).

***

### title?

```ts
readonly optional title?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1382](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1382)

**`Beta`**

A short header to show above [prompt](#prompt), when the agent gave one.

***

### options?

```ts
readonly optional options?: readonly AgentElicitationOption[];
```

Defined in: [packages/sdk/src/agents-service.ts:1385](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1385)

**`Beta`**

The choices, for `"select"` / `"multi-select"`. Never empty when
 present — a question with no usable options arrives as `"text"`.

***

### custom?

```ts
readonly optional custom?: AgentElicitationCustomAnswer;
```

Defined in: [packages/sdk/src/agents-service.ts:1387](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1387)

**`Beta`**

The question's own free-text box, when it has one.
