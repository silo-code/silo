# Interface: AgentSessionSummary

Defined in: [packages/sdk/src/agents-service.ts:1626](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1626)

**`Beta`**

One session an agent reports via `session/list` (ACP v1 stable) —
**Session Discovery** (RFC 0051). Metadata only, not a live handle.

## Properties

### sessionId

```ts
readonly sessionId: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1629](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1629)

**`Beta`**

What to pass as [AgentSessionRestore.sessionId](AgentSessionRestore.md#sessionid) to resume this
 one.

***

### cwd?

```ts
readonly optional cwd?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1632](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1632)

**`Beta`**

The working directory this session ran in, when the agent reports one —
 may differ from the current session's own cwd.

***

### title?

```ts
readonly optional title?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1634](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1634)

**`Beta`**

A display title, when the agent reports one.

***

### updatedAt?

```ts
readonly optional updatedAt?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1636](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1636)

**`Beta`**

Last-activity timestamp (ISO 8601), when the agent reports one.

***

### raw

```ts
readonly raw: Record<string, unknown>;
```

Defined in: [packages/sdk/src/agents-service.ts:1639](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1639)

**`Beta`**

The agent's own `SessionInfo` object, untouched — the escape hatch for
 a vendor field this type does not model.
