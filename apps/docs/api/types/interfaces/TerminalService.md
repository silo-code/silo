# Interface: TerminalService

Defined in: [packages/sdk/src/terminal-service.ts:96](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L96)

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

Defined in: [packages/sdk/src/terminal-service.ts:102](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L102)

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

Defined in: [packages/sdk/src/terminal-service.ts:104](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L104)

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

Defined in: [packages/sdk/src/terminal-service.ts:110](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L110)

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

Defined in: [packages/sdk/src/terminal-service.ts:118](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L118)

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

Defined in: [packages/sdk/src/terminal-service.ts:124](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L124)

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

Defined in: [packages/sdk/src/terminal-service.ts:131](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L131)

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

Defined in: [packages/sdk/src/terminal-service.ts:137](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L137)

Subscribe to tab decoration invalidations. Returns a [Disposable](Disposable.md)
that cancels the subscription.

#### Parameters

##### listener

() => `void`

#### Returns

[`Disposable`](Disposable.md)

***

### subscribeOsc()

```ts
subscribeOsc(terminalId, handler): Disposable;
```

Defined in: [packages/sdk/src/terminal-service.ts:167](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L167)

Subscribe to raw OSC (Operating System Command) escape sequences emitted
by the terminal identified by `terminalId`. The handler is called once per
parsed sequence — regardless of whether the terminal's panel is currently
visible — making it suitable for background status monitoring.

The subscription is keyed to the **terminal record id** (e.g.
`"term_…"`), not the underlying PTY session id, so it survives terminal
recreation within the same record.

Returns a [Disposable](Disposable.md) that cancels the subscription.

#### Parameters

##### terminalId

`string`

##### handler

(`event`) => `void`

#### Returns

[`Disposable`](Disposable.md)

#### Example

```ts
// Detect Claude Code busy/idle state from OSC 0 title sequences.
const BRAILLE_START = 0x2800;
const BRAILLE_END   = 0x28FF;
const IDLE_CHAR     = '\u2733'; // ✳

const sub = ctx.terminals.subscribeOsc(terminalId, ({ code, payload }) => {
  if (code !== 0) return;
  const first = payload.charCodeAt(0);
  if (first >= BRAILLE_START && first <= BRAILLE_END) setStatus('busy');
  else if (payload.startsWith(IDLE_CHAR))              setStatus('idle');
});
ctx.subscriptions.push(sub);
```

***

### getActive()

```ts
getActive(): string | null;
```

Defined in: [packages/sdk/src/terminal-service.ts:179](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L179)

The record id of the terminal tab that is currently active in the active
workspace's center dock, or `null` when an editor tab (or nothing) is
active. "Active" is the dock's single active panel — the tab the user is
looking at and typing into — so a terminal merely visible in a non-active
split does not count.

#### Returns

`string` \| `null`

***

### subscribeActive()

```ts
subscribeActive(listener): Disposable;
```

Defined in: [packages/sdk/src/terminal-service.ts:201](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L201)

Subscribe to active-terminal changes. The listener receives the terminal
record id whenever a terminal tab becomes the active center-dock panel,
and `null` when activation moves elsewhere (an editor tab, or no panel —
including transiently during a workspace switch, before the incoming
workspace's active tab is published).

Fires on tab activation, group activation, and workspace switches.
Returns a [Disposable](Disposable.md) that cancels the subscription.

#### Parameters

##### listener

(`terminalId`) => `void`

#### Returns

[`Disposable`](Disposable.md)

#### Example

```ts
// Clear a "needs attention" marker once the user views the terminal.
ctx.subscriptions.push(
  ctx.terminals.subscribeActive((terminalId) => {
    if (terminalId) attention.delete(terminalId);
  }),
);
```
