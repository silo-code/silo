# Interface: AgentSessionSummary

Defined in: [packages/sdk/src/agents-service.ts:1310](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1310)

**`Beta`**

One session an agent reports via `session/list` (ACP v1 stable) —
**Session Discovery** (RFC 0051). Metadata only, not a live handle.

## Properties

### sessionId

```ts
readonly sessionId: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1313](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1313)

**`Beta`**

What to pass as [AgentSessionRestore.sessionId](AgentSessionRestore.md#sessionid) to resume this
 one.

***

### cwd?

```ts
readonly optional cwd?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1316](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1316)

**`Beta`**

The working directory this session ran in, when the agent reports one —
 may differ from the current session's own cwd.

***

### title?

```ts
readonly optional title?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1318](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1318)

**`Beta`**

A display title, when the agent reports one.

***

### updatedAt?

```ts
readonly optional updatedAt?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:1320](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1320)

**`Beta`**

Last-activity timestamp (ISO 8601), when the agent reports one.

***

### raw

```ts
readonly raw: Record<string, unknown>;
```

Defined in: [packages/sdk/src/agents-service.ts:1323](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1323)

**`Beta`**

The agent's own `SessionInfo` object, untouched — the escape hatch for
 a vendor field this type does not model.
