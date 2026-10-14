# Interface: AgentSessionSummary

Defined in: [packages/sdk/src/agents-service.ts:1819](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1819)

**`Beta`**

One session an agent reports via `session/list` (ACP v1 stable) —
**Session Discovery** (RFC 0051). Metadata only, not a live handle.

## Properties

### sessionId

```ts
readonly sessionId: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1822](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1822)

**`Beta`**

What to pass as [AgentSessionRestore.sessionId](AgentSessionRestore.md#sessionid) to resume this
 one.

***

### cwd?

```ts
readonly optional cwd?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1825](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1825)

**`Beta`**

The working directory this session ran in, when the agent reports one —
 may differ from the current session's own cwd.

***

### title?

```ts
readonly optional title?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1827](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1827)

**`Beta`**

A display title, when the agent reports one.

***

### updatedAt?

```ts
readonly optional updatedAt?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1829](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1829)

**`Beta`**

Last-activity timestamp (ISO 8601), when the agent reports one.

***

### raw

```ts
readonly raw: Record<string, unknown>;
```

Defined in: [packages/sdk/src/agents-service.ts:1832](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1832)

**`Beta`**

The agent's own `SessionInfo` object, untouched — the escape hatch for
 a vendor field this type does not model.
