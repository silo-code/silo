# Interface: AgentPermissionRequest

Defined in: [packages/sdk/src/agents-service.ts:827](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L827)

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

Defined in: [packages/sdk/src/agents-service.ts:830](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L830)

**`Beta`**

The tool call this permission is for — the same id as the matching
 [AgentToolCall.toolCallId](AgentToolCall.md#toolcallid) in the update stream.

***

### title

```ts
readonly title: string;
```

Defined in: [packages/sdk/src/agents-service.ts:832](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L832)

**`Beta`**

A human-readable description of what the agent wants to do.

***

### options

```ts
readonly options: readonly AgentPermissionOption[];
```

Defined in: [packages/sdk/src/agents-service.ts:834](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L834)

**`Beta`**

The choices to present. Always at least one; order is the agent's.

***

### toolCall?

```ts
readonly optional toolCall?: AgentToolCall;
```

Defined in: [packages/sdk/src/agents-service.ts:841](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L841)

**`Beta`**

The call the agent is asking to make, when it sent one — the protocol's
`toolCall` params, the same shape the update stream carries. It is how a
Chat UI can show the diff **before** the user answers rather than only the
title; `claude-agent-acp` 0.75.1 sends a full one including `content`.

***

### raw

```ts
readonly raw: Readonly<Record<string, unknown>>;
```

Defined in: [packages/sdk/src/agents-service.ts:843](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L843)

**`Beta`**

The raw Agent Client Protocol `session/request_permission` params.

## Methods

### respond()

```ts
respond(optionId): void;
```

Defined in: [packages/sdk/src/agents-service.ts:849](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L849)

**`Beta`**

Answer the request with one of [AgentPermissionRequest.options](#options).
Idempotent — the first call wins, later calls are ignored. Passing an
`optionId` that is not in `options` answers `cancelled`.

#### Parameters

##### optionId

`string`

#### Returns

`void`
