# Interface: AgentSessionUpdate

Defined in: [packages/sdk/src/agents-service.ts:812](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L812)

**`Beta`**

One `session/update` notification from a **Chat session**, lightly
normalized. The Agent Client Protocol streams a turn as a sequence of these:
assistant text, agent "thinking", tool-call rows, plan updates, and more.

**A consumer must tolerate `kind` values it does not recognize** — agents
emit different subsets and vendors add their own (recon §3). Switch on the
kinds you render and ignore the rest; never treat an unknown kind as an
error.

Everything a Chat UI must draw to render a transcript is a modelled field:
[text](#text) / [content](#content) for the message kinds, [toolCall](#toolcall) for
`tool_call` and `tool_call_update`, [plan](#plan) for `plan`, [usage](#usage)
for `usage_update`. [raw](#raw) is for what is deliberately left out — see
its own note.

## Properties

### kind

```ts
readonly kind: string;
```

Defined in: [packages/sdk/src/agents-service.ts:818](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L818)

**`Beta`**

The Agent Client Protocol `sessionUpdate` discriminator, e.g.
`"agent_message_chunk"`, `"agent_thought_chunk"`, `"tool_call"`,
`"tool_call_update"`, `"plan"`, `"available_commands_update"`.

***

### text?

```ts
readonly optional text?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:825](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L825)

**`Beta`**

Text payload for the streaming-text kinds (`agent_message_chunk`,
`agent_thought_chunk`, `user_message_chunk`); `undefined` for every other
kind — and also for a text kind whose block is not text, in which case
read [content](#content).

***

### content?

```ts
readonly optional content?: AgentContentBlock;
```

Defined in: [packages/sdk/src/agents-service.ts:832](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L832)

**`Beta`**

The whole content block a streaming-text kind carried, of which
[text](#text) is the `"text"` shorthand. Read it when you want to render an
image or a resource link an agent sent as a message rather than dropping
it. `undefined` for every non-message kind.

***

### messageId?

```ts
readonly optional messageId?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:839](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L839)

**`Beta`**

Stable id for the run of chunks this update belongs to. Consecutive
same-kind chunks share one — **synthesized by Silo when the agent omits
`messageId`**, which real agents do (recon Finding 7), so a consumer can
group a streamed sentence into one bubble without minting ids itself.

***

### timestamp?

```ts
readonly optional timestamp?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:853](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L853)

**`Beta`**

ISO 8601 timestamp for **when this update was recorded**, when Silo
itself is the one recording it — currently just the synthesized
`user_message_chunk` a prompt's own turn writes into the **transcript
journal** (RFC 0042), stamped at `session/prompt` time since the Agent
Client Protocol never echoes a user's own prompt back. `undefined` for
every update read straight off the wire: ACP carries no timestamp field,
so a live `onUpdate` notification never has one. A Chat UI wanting "when
was this sent" for its own just-appended prompt already knows that
locally; this field exists so the same information survives a **journal
replay** (`session/resume`, or `journal-only` restore) after the
in-memory value is gone.

***

### toolCall?

```ts
readonly optional toolCall?: AgentToolCall;
```

Defined in: [packages/sdk/src/agents-service.ts:859](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L859)

**`Beta`**

The tool call, for `kind` `"tool_call"` and `"tool_call_update"`;
`undefined` otherwise. Key rows by [AgentToolCall.toolCallId](AgentToolCall.md#toolcallid) and
patch in place — an update carries only what changed.

***

### plan?

```ts
readonly optional plan?: readonly AgentPlanEntry[];
```

Defined in: [packages/sdk/src/agents-service.ts:865](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L865)

**`Beta`**

The agent's plan **in full**, for `kind` `"plan"`; `undefined` otherwise.
The agent reissues the entire list every time, so replace the plan you are
showing rather than appending to it. May be empty.

***

### usage?

```ts
readonly optional usage?: AgentSessionUsage;
```

Defined in: [packages/sdk/src/agents-service.ts:871](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L871)

**`Beta`**

Session context/cost state, for `kind` `"usage_update"`; `undefined`
otherwise, and also whenever the connected agent doesn't send this
notification at all — see [AgentSessionUsage](AgentSessionUsage.md).

***

### raw

```ts
readonly raw: Readonly<Record<string, unknown>>;
```

Defined in: [packages/sdk/src/agents-service.ts:891](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L891)

**`Beta`**

The raw Agent Client Protocol `update` object — the **escape hatch**, for
the kinds and fields this surface does not model.

What is deliberately not modelled, and why: `available_commands_update`
(an agent's slash commands — a menu, not a transcript row),
`current_mode_update` (already surfaced as
[AgentSessionConfigOption.currentValue](AgentSessionConfigOption.md#currentvalue)), `session_info_update`
(already surfaced as [AgentInfo.title](AgentInfo.md#title)), and vendor extensions such
as `claude-agent-acp`'s `_meta`. None is needed to draw a transcript; all
are readable here.

**`raw` tracks the protocol, not this SDK's semver.** A field inside it can
change shape, or vanish, when an agent or its adapter changes — no SDK
major required, and that has already happened three times inside one sprint.
Read it defensively, and if you find yourself needing it for something
every Chat UI must render, that is a gap in this surface worth reporting.
Treat it as read-only.
