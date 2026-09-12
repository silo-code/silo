# Interface: AgentPromptCapabilities

Defined in: [packages/sdk/src/agents-service.ts:982](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L982)

**`Beta`**

What a Chat session accepts as prompt content, read once from `initialize`
and fixed for the session's life (RFC 0040). A UI gates its attachment
affordance on this rather than offering one that fails at prompt time.

A field the agent's `initialize` response omitted defaults to `false`
rather than being left `undefined` — both `codex-acp` and `claude-agent-acp`
omit `audio` entirely (recon 2026-09-09), so treating an absent field as
"not accepted" is the only reading that doesn't require every consumer to
repeat the same `?? false`.

## Properties

### image

```ts
readonly image: boolean;
```

Defined in: [packages/sdk/src/agents-service.ts:985](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L985)

**`Beta`**

Image content blocks are accepted. Not yet a sendable
 [AgentPromptBlock](../type-aliases/AgentPromptBlock.md) — see its doc comment.

***

### audio

```ts
readonly audio: boolean;
```

Defined in: [packages/sdk/src/agents-service.ts:987](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L987)

**`Beta`**

Audio content blocks are accepted.

***

### embeddedContext

```ts
readonly embeddedContext: boolean;
```

Defined in: [packages/sdk/src/agents-service.ts:993](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L993)

**`Beta`**

Embedded `"resource"` [AgentPromptBlock](../type-aliases/AgentPromptBlock.md)s are accepted. A
`"resource_link"` (a pointer the agent may read itself) is always
allowed and is not gated on this.
