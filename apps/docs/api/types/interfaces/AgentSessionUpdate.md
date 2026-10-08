# Interface: AgentSessionUpdate

Defined in: [packages/sdk/src/agents-service.ts:982](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L982)

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

Defined in: [packages/sdk/src/agents-service.ts:988](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L988)

**`Beta`**

The Agent Client Protocol `sessionUpdate` discriminator, e.g.
`"agent_message_chunk"`, `"agent_thought_chunk"`, `"tool_call"`,
`"tool_call_update"`, `"plan"`, `"available_commands_update"`.

***

### text?

```ts
readonly optional text?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:995](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L995)

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

Defined in: [packages/sdk/src/agents-service.ts:1002](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1002)

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

Defined in: [packages/sdk/src/agents-service.ts:1009](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1009)

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

Defined in: [packages/sdk/src/agents-service.ts:1023](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1023)

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

Defined in: [packages/sdk/src/agents-service.ts:1029](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1029)

**`Beta`**

The tool call, for `kind` `"tool_call"` and `"tool_call_update"`;
`undefined` otherwise. Key rows by [AgentToolCall.toolCallId](AgentToolCall.md#toolcallid) and
patch in place — an update carries only what changed.

***

### plan?

```ts
readonly optional plan?: readonly AgentPlanEntry[];
```

Defined in: [packages/sdk/src/agents-service.ts:1035](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1035)

**`Beta`**

The agent's plan **in full**, for `kind` `"plan"`; `undefined` otherwise.
The agent reissues the entire list every time, so replace the plan you are
showing rather than appending to it. May be empty.

***

### usage?

```ts
readonly optional usage?: AgentSessionUsage;
```

Defined in: [packages/sdk/src/agents-service.ts:1041](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1041)

**`Beta`**

Session context/cost state, for `kind` `"usage_update"`; `undefined`
otherwise, and also whenever the connected agent doesn't send this
notification at all — see [AgentSessionUsage](AgentSessionUsage.md).

***

### subagentId?

```ts
readonly optional subagentId?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1063](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1063)

**`Beta`**

The **delegated worker that produced this frame** — set on every update a
subagent authored, absent on the session's own.

Delegated work arrives on the same stream as the parent's, because a
subagent is a session of its own that Silo routes into the session that
spawned it. Without this field a subagent's prose and tool calls would be
indistinguishable from the parent's and would read as the parent speaking.
So: **render a frame carrying this attributed to its worker**, inside the
dispatch it belongs to, never as the agent's own output.

The id matches [AgentToolCall.subagentId](AgentToolCall.md#subagentid) on the dispatch that
started the worker — note the different subject there (that call's
*delegate*; here, this frame's *author*). Where the frame also carries
[AgentToolCall.parentToolCallId](AgentToolCall.md#parenttoolcallid), that is the more direct route to
the dispatch row.

Absent for every frame on a session with no delegation, and for every
agent that doesn't report it — in which case the transcript renders as it
always has.

***

### delegation?

```ts
readonly optional delegation?: AgentDelegation;
```

Defined in: [packages/sdk/src/agents-service.ts:1079](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1079)

**`Beta`**

A **delegated worker's lifecycle event** — a subagent appearing, or
reporting how it ended. `undefined` on every other frame.

These events arrive on the **parent's** session, not the worker's, so
[subagentId](#subagentid) is `undefined` on a frame carrying one: it is the
parent telling you about its delegate. Read [AgentDelegation](AgentDelegation.md)
for which worker and what happened.

Unlike most of this interface, this does **not** correspond to one
protocol `kind`. [kind](#kind) stays the wire's own discriminator and will
read a vendor spelling for these frames; don't match on it. Reading this
field instead is what keeps a consumer working when the canonical
protocol replaces the vendor extension underneath.

***

### raw

```ts
readonly raw: Readonly<Record<string, unknown>>;
```

Defined in: [packages/sdk/src/agents-service.ts:1099](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1099)

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
