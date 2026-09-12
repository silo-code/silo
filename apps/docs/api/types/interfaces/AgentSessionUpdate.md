# Interface: AgentSessionUpdate

Defined in: [packages/sdk/src/agents-service.ts:683](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L683)

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
`tool_call` and `tool_call_update`, [plan](#plan) for `plan`. [raw](#raw) is
for what is deliberately left out — see its own note.

## Properties

### kind

```ts
readonly kind: string;
```

Defined in: [packages/sdk/src/agents-service.ts:689](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L689)

**`Beta`**

The Agent Client Protocol `sessionUpdate` discriminator, e.g.
`"agent_message_chunk"`, `"agent_thought_chunk"`, `"tool_call"`,
`"tool_call_update"`, `"plan"`, `"available_commands_update"`.

***

### text?

```ts
readonly optional text?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:696](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L696)

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

Defined in: [packages/sdk/src/agents-service.ts:703](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L703)

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

Defined in: [packages/sdk/src/agents-service.ts:710](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L710)

**`Beta`**

Stable id for the run of chunks this update belongs to. Consecutive
same-kind chunks share one — **synthesized by Silo when the agent omits
`messageId`**, which real agents do (recon Finding 7), so a consumer can
group a streamed sentence into one bubble without minting ids itself.

***

### toolCall?

```ts
readonly optional toolCall?: AgentToolCall;
```

Defined in: [packages/sdk/src/agents-service.ts:716](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L716)

**`Beta`**

The tool call, for `kind` `"tool_call"` and `"tool_call_update"`;
`undefined` otherwise. Key rows by [AgentToolCall.toolCallId](AgentToolCall.md#toolcallid) and
patch in place — an update carries only what changed.

***

### plan?

```ts
readonly optional plan?: readonly AgentPlanEntry[];
```

Defined in: [packages/sdk/src/agents-service.ts:722](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L722)

**`Beta`**

The agent's plan **in full**, for `kind` `"plan"`; `undefined` otherwise.
The agent reissues the entire list every time, so replace the plan you are
showing rather than appending to it. May be empty.

***

### raw

```ts
readonly raw: Readonly<Record<string, unknown>>;
```

Defined in: [packages/sdk/src/agents-service.ts:743](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L743)

**`Beta`**

The raw Agent Client Protocol `update` object — the **escape hatch**, for
the kinds and fields this surface does not model.

What is deliberately not modelled, and why: `available_commands_update`
(an agent's slash commands — a menu, not a transcript row),
`usage_update` (token counts, which no agent reports the same way),
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
