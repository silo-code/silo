# Interface: TerminalService

Defined in: [packages/sdk/src/terminal-service.ts:32](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L32)

Consumer API for the terminal domain, exposed as
[ExtensionContext.terminals](ExtensionContext.md#terminals). The terminal is a core feature — a
built-in DockKind like the editor — so this mirrors [EditorService](EditorService.md):
`create` opens a terminal tab in a workspace, and `closeWorkspace` reaps a
workspace's terminals (used when a workspace is deleted). The tab itself is
rendered by the core dock from the workspace's terminal records.

## Methods

### create()

```ts
create(input?): TerminalRecord | undefined;
```

Defined in: [packages/sdk/src/terminal-service.ts:38](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L38)

Open a new terminal in a workspace (defaults to the active one). Returns the
created [TerminalRecord](TerminalRecord.md); the PTY session spawns lazily when its tab
mounts.

#### Parameters

##### input?

[`CreateTerminalInput`](CreateTerminalInput.md)

#### Returns

[`TerminalRecord`](TerminalRecord.md) \| `undefined`

***

### closeWorkspace()

```ts
closeWorkspace(workspaceId): void;
```

Defined in: [packages/sdk/src/terminal-service.ts:40](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L40)

Close and kill every terminal in a workspace (e.g. on workspace delete).

#### Parameters

##### workspaceId

`string`

#### Returns

`void`
