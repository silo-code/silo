# Type Alias: PromptRefusal

```ts
type PromptRefusal = "no-agent" | "agent-takes-none" | "unsupported-shell" | "too-large";
```

Defined in: [packages/sdk/src/agents-service.ts:215](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L215)

**`Beta`**

Why an opening prompt could not be delivered. Silo refuses rather than
approximating: a prompt it cannot quote exactly is never typed, and no agent
is started without the prompt the caller asked for.
