# Interface: TerminalService

Defined in: [packages/sdk/src/terminal-service.ts:76](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L76)

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

Defined in: [packages/sdk/src/terminal-service.ts:82](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L82)

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

Defined in: [packages/sdk/src/terminal-service.ts:84](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L84)

Close and kill every terminal in a workspace (e.g. on workspace delete).

#### Parameters

##### workspaceId

`string`

#### Returns

`void`

***

### focus()

```ts
focus(terminalId): void;
```

Defined in: [packages/sdk/src/terminal-service.ts:90](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L90)

Switch to the workspace containing this terminal and activate its tab in
the center dock. No-ops if the terminal id is unknown.

#### Parameters

##### terminalId

`string`

#### Returns

`void`

***

### registerTabDecoration()

```ts
registerTabDecoration(provider): Disposable;
```

Defined in: [packages/sdk/src/terminal-service.ts:98](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L98)

Register a decoration provider for terminal tabs. The first registered
provider that returns a non-null decoration for a terminal wins; subsequent
providers are not consulted. Returns a [Disposable](Disposable.md) that unregisters
the provider.

#### Parameters

##### provider

[`TerminalTabDecorationProvider`](TerminalTabDecorationProvider.md)

#### Returns

[`Disposable`](Disposable.md)

***

### getTabDecoration()

```ts
getTabDecoration(terminalId): TerminalTabDecoration | null;
```

Defined in: [packages/sdk/src/terminal-service.ts:104](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L104)

Get the current decoration for a terminal tab. Returns the first non-null
result from registered providers, or `null` if none apply.

#### Parameters

##### terminalId

`string`

#### Returns

[`TerminalTabDecoration`](TerminalTabDecoration.md) \| `null`

***

### invalidateTabDecorations()

```ts
invalidateTabDecorations(): void;
```

Defined in: [packages/sdk/src/terminal-service.ts:111](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L111)

Signal that tab decoration data has changed. Fires all listeners registered
via [TerminalService.subscribeTabDecorations](#subscribetabdecorations), causing terminal tabs
to re-query providers and re-render their decoration.

#### Returns

`void`

***

### subscribeTabDecorations()

```ts
subscribeTabDecorations(listener): Disposable;
```

Defined in: [packages/sdk/src/terminal-service.ts:117](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L117)

Subscribe to tab decoration invalidations. Returns a [Disposable](Disposable.md)
that cancels the subscription.

#### Parameters

##### listener

() => `void`

#### Returns

[`Disposable`](Disposable.md)
