# Interface: AgentPermissionRequest

Defined in: [packages/sdk/src/agents-service.ts:557](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L557)

**`Beta`**

The agent is **blocked on the user**: it wants permission to run a tool and
the turn will not proceed until [AgentPermissionRequest.respond](#respond) is
called. Delivered to [AgentSessionHandle.onPermission](AgentSessionHandle.md#onpermission).

**This is not a safety boundary.** An agent routes a request through here
only if it chooses to; nothing stops it touching the filesystem directly
(recon Finding 1). Do not present this as Silo gating the agent's actions.

If no `onPermission` listener is registered, Silo answers `cancelled` on the
extension's behalf so the agent is never left hanging.

## Properties

### toolCallId

```ts
readonly toolCallId: string;
```

Defined in: [packages/sdk/src/agents-service.ts:560](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L560)

**`Beta`**

The tool call this permission is for — matches a `tool_call`
 [AgentSessionUpdate](AgentSessionUpdate.md)'s `toolCallId` in `raw`.

***

### title

```ts
readonly title: string;
```

Defined in: [packages/sdk/src/agents-service.ts:562](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L562)

**`Beta`**

A human-readable description of what the agent wants to do.

***

### options

```ts
readonly options: readonly AgentPermissionOption[];
```

Defined in: [packages/sdk/src/agents-service.ts:564](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L564)

**`Beta`**

The choices to present. Always at least one; order is the agent's.

***

### raw

```ts
readonly raw: Readonly<Record<string, unknown>>;
```

Defined in: [packages/sdk/src/agents-service.ts:566](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L566)

**`Beta`**

The raw Agent Client Protocol `session/request_permission` params.

## Methods

### respond()

```ts
respond(optionId): void;
```

Defined in: [packages/sdk/src/agents-service.ts:572](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L572)

**`Beta`**

Answer the request with one of [AgentPermissionRequest.options](#options).
Idempotent — the first call wins, later calls are ignored. Passing an
`optionId` that is not in `options` answers `cancelled`.

#### Parameters

##### optionId

`string`

#### Returns

`void`
