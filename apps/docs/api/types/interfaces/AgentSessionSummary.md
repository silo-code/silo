# Interface: AgentSessionSummary

Defined in: [packages/sdk/src/agents-service.ts:1487](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1487)

**`Beta`**

One session an agent reports via `session/list` (ACP v1 stable) —
**Session Discovery** (RFC 0051). Metadata only, not a live handle.

## Properties

### sessionId

```ts
readonly sessionId: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1490](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1490)

**`Beta`**

What to pass as [AgentSessionRestore.sessionId](AgentSessionRestore.md#sessionid) to resume this
 one.

***

### cwd?

```ts
readonly optional cwd?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1493](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1493)

**`Beta`**

The working directory this session ran in, when the agent reports one —
 may differ from the current session's own cwd.

***

### title?

```ts
readonly optional title?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1495](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1495)

**`Beta`**

A display title, when the agent reports one.

***

### updatedAt?

```ts
readonly optional updatedAt?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1497](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1497)

**`Beta`**

Last-activity timestamp (ISO 8601), when the agent reports one.

***

### raw

```ts
readonly raw: Record<string, unknown>;
```

Defined in: [packages/sdk/src/agents-service.ts:1500](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1500)

**`Beta`**

The agent's own `SessionInfo` object, untouched — the escape hatch for
 a vendor field this type does not model.
