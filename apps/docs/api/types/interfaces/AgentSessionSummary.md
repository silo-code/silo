# Interface: AgentSessionSummary

Defined in: [packages/sdk/src/agents-service.ts:1265](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1265)

**`Beta`**

One session an agent reports via `session/list` (ACP v1 stable) —
**Session Discovery** (RFC 0051). Metadata only, not a live handle.

## Properties

### sessionId

```ts
readonly sessionId: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1268](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1268)

**`Beta`**

What to pass as [AgentSessionRestore.sessionId](AgentSessionRestore.md#sessionid) to resume this
 one.

***

### cwd?

```ts
readonly optional cwd?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1271](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1271)

**`Beta`**

The working directory this session ran in, when the agent reports one —
 may differ from the current session's own cwd.

***

### title?

```ts
readonly optional title?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1273](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1273)

**`Beta`**

A display title, when the agent reports one.

***

### updatedAt?

```ts
readonly optional updatedAt?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1275](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1275)

**`Beta`**

Last-activity timestamp (ISO 8601), when the agent reports one.

***

### raw

```ts
readonly raw: Record<string, unknown>;
```

Defined in: [packages/sdk/src/agents-service.ts:1278](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1278)

**`Beta`**

The agent's own `SessionInfo` object, untouched — the escape hatch for
 a vendor field this type does not model.
