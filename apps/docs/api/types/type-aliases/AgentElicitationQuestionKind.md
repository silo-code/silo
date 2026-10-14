# Type Alias: AgentElicitationQuestionKind

```ts
type AgentElicitationQuestionKind = "select" | "multi-select" | "text" | "boolean" | "number";
```

Defined in: [packages/sdk/src/agents-service.ts:1335](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1335)

**`Beta`**

Which control an [AgentElicitationQuestion](../interfaces/AgentElicitationQuestion.md) asks for.

Silo renders a deliberate subset of JSON Schema — the shape the agents
actually send. Anything outside it degrades to `"text"` rather than being
dropped, so **every question always reaches the user**: free text is a
first-class answer in this protocol, not a fallback that loses information.
