# Interface: AgentElicitationAnswer

Defined in: [packages/sdk/src/agents-service.ts:1413](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1413)

**`Beta`**

One question's answer, as passed to
[AgentElicitationRequest.respond](AgentElicitationRequest.md#respond).

Omit both fields — or omit the question from the map entirely — to leave it
unanswered; Silo sends no value for it rather than inventing one.

## Properties

### value?

```ts
readonly optional value?: string | number | boolean | readonly string[];
```

Defined in: [packages/sdk/src/agents-service.ts:1422](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1422)

**`Beta`**

The selection or typed value, matched to the question's
[AgentElicitationQuestion.kind](AgentElicitationQuestion.md#kind): an option `value` for `"select"`,
an array of them for `"multi-select"`, the text for `"text"`, a boolean,
or a number. A number may be passed as the string an input produced — it
is coerced, and **omitted** if it does not parse, since a malformed value
would make some agents discard the whole payload.

***

### custom?

```ts
readonly optional custom?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1428](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1428)

**`Beta`**

Free text the user typed into this question's
[AgentElicitationQuestion.custom](AgentElicitationQuestion.md#custom) box. When non-empty it overrides
[value](#value), per the agent's own precedence rule.
