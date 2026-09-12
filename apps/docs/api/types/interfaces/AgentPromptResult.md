# Interface: AgentPromptResult

Defined in: [packages/sdk/src/agents-service.ts:565](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L565)

**`Beta`**

What [AgentSessionHandle.prompt](AgentSessionHandle.md#prompt) resolves to. A prompt that cannot be
delivered — the connection dropped, the agent errored mid-turn — **rejects**
instead, with the agent's own message where there is one.

## Properties

### stopReason

```ts
readonly stopReason: AgentStopReason;
```

Defined in: [packages/sdk/src/agents-service.ts:566](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L566)

**`Beta`**
