# Interface: AgentPromptResult

Defined in: [packages/sdk/src/agents-service.ts:581](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L581)

**`Beta`**

What [AgentSessionHandle.prompt](AgentSessionHandle.md#prompt) resolves to. A prompt that cannot be
delivered — the connection dropped, the agent errored mid-turn — **rejects**
instead, with the agent's own message where there is one.

## Properties

### stopReason

```ts
readonly stopReason: AgentStopReason;
```

Defined in: [packages/sdk/src/agents-service.ts:582](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L582)

**`Beta`**
