# Interface: AgentPromptResult

Defined in: [packages/sdk/src/agents-service.ts:588](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L588)

**`Beta`**

What [AgentSessionHandle.prompt](AgentSessionHandle.md#prompt) resolves to. A prompt that cannot be
delivered — the connection dropped, the agent errored mid-turn — **rejects**
instead, with the agent's own message where there is one.

## Properties

### stopReason

```ts
readonly stopReason: AgentStopReason;
```

Defined in: [packages/sdk/src/agents-service.ts:589](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L589)

**`Beta`**
