# Interface: AgentSessionConnectOptions

Defined in: [packages/sdk/src/agents-service.ts:992](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L992)

**`Beta`**

Options for [AgentSessionsService.connect](AgentSessionsService.md#connect).

## Properties

### cwd?

```ts
optional cwd?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:994](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L994)

**`Beta`**

Working directory for the agent. Defaults to the workspace folder.

***

### workspaceId?

```ts
optional workspaceId?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:997](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L997)

**`Beta`**

Which workspace the session belongs to (for
 [AgentInfo.workspaceId](AgentInfo.md#workspaceid) and `reveal`). Defaults to the active one.

***

### reveal?

```ts
optional reveal?: () => void;
```

Defined in: [packages/sdk/src/agents-service.ts:1015](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1015)

**`Beta`**

How to bring **your** UI for this session into view. Silo calls this from
[AgentsService.reveal](AgentsService.md#reveal) — after activating the session's workspace —
so a kind-agnostic caller (the Agents navigator, a notification, a
command) can focus a Chat session's transcript without knowing that a
transcript is what it is.

Implement it with whatever "come to the front" means for your surface: a
dock panel calls `api.setActive()` on its own `DockPanelApi`, a side
panel reveals itself through `ctx.layout`. Called on the main thread,
possibly more than once; keep it cheap and idempotent, and expect it after
an `await` — capture the handle you need in a ref rather than closing over
render-scoped state.

Omit it and `reveal(id)` still activates the workspace, which is all Silo
can honestly do for a session whose UI it does not own.

#### Returns

`void`
