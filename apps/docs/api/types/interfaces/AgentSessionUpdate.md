# Interface: AgentSessionUpdate

Defined in: [packages/sdk/src/agents-service.ts:494](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L494)

**`Beta`**

One `session/update` notification from a **Chat session**, lightly
normalized. The Agent Client Protocol streams a turn as a sequence of these:
assistant text, agent "thinking", tool-call rows, plan updates, and more.

**A consumer must tolerate `kind` values it does not recognize** — agents
emit different subsets and vendors add their own (recon §3). Switch on the
kinds you render and ignore the rest; never treat an unknown kind as an
error.

## Properties

### kind

```ts
readonly kind: string;
```

Defined in: [packages/sdk/src/agents-service.ts:500](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L500)

**`Beta`**

The Agent Client Protocol `sessionUpdate` discriminator, e.g.
`"agent_message_chunk"`, `"agent_thought_chunk"`, `"tool_call"`,
`"tool_call_update"`, `"plan"`, `"available_commands_update"`.

***

### text?

```ts
readonly optional text?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:506](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L506)

**`Beta`**

Text payload for the streaming-text kinds (`agent_message_chunk`,
`agent_thought_chunk`, `user_message_chunk`); `undefined` for every other
kind.

***

### messageId?

```ts
readonly optional messageId?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:513](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L513)

**`Beta`**

Stable id for the run of chunks this update belongs to. Consecutive
same-kind chunks share one — **synthesized by Silo when the agent omits
`messageId`**, which real agents do (recon Finding 7), so a consumer can
group a streamed sentence into one bubble without minting ids itself.

***

### raw

```ts
readonly raw: Readonly<Record<string, unknown>>;
```

Defined in: [packages/sdk/src/agents-service.ts:519](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L519)

**`Beta`**

The raw Agent Client Protocol `update` object, for any kind this surface
does not model yet (tool-call fields, plan entries, command lists). Treat
it as read-only.
