# Interface: TerminalService

Defined in: [packages/sdk/src/terminal-service.ts:144](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L144)

Consumer API for the terminal domain, exposed as
[ExtensionContext.terminals](ExtensionContext.md#terminals). The terminal is a core feature — a
built-in DockKind like the editor — so this mirrors [EditorService](EditorService.md):
`create` opens a terminal tab in a workspace, and `closeWorkspace` reaps a
workspace's terminals. [WorkspaceService.delete](WorkspaceService.md#delete) calls `closeWorkspace`
for you; the primitive remains available for surgical reaping without
deleting the workspace. The tab itself is rendered by the core dock from the
workspace's terminal records.

Tab chrome adornments (`setIcon` / `setIndicator` / …) take a **terminal
session id** as the target — see [TabAdornmentMethods](TabAdornmentMethods.md).

## Extends

- [`TabAdornmentMethods`](TabAdornmentMethods.md)

## Methods

### setIcon()

```ts
setIcon(targetId, adornment): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:229](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L229)

#### Parameters

##### targetId

`string`

##### adornment

[`TabIconAdornment`](TabIconAdornment.md)

#### Returns

`void`

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`setIcon`](TabAdornmentMethods.md#seticon)

***

### clearIcon()

```ts
clearIcon(targetId, adornmentId): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:230](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L230)

#### Parameters

##### targetId

`string`

##### adornmentId

`string`

#### Returns

`void`

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`clearIcon`](TabAdornmentMethods.md#clearicon)

***

### bindIcon()

```ts
bindIcon(binder): Disposable;
```

Defined in: [packages/sdk/src/tab-adornment.ts:231](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L231)

#### Parameters

##### binder

[`TabIconBinder`](TabIconBinder.md)

#### Returns

[`Disposable`](Disposable.md)

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`bindIcon`](TabAdornmentMethods.md#bindicon)

***

### setHighlight()

```ts
setHighlight(targetId, adornment): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:233](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L233)

#### Parameters

##### targetId

`string`

##### adornment

[`TabHighlightAdornment`](TabHighlightAdornment.md)

#### Returns

`void`

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`setHighlight`](TabAdornmentMethods.md#sethighlight)

***

### clearHighlight()

```ts
clearHighlight(targetId, adornmentId): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:234](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L234)

#### Parameters

##### targetId

`string`

##### adornmentId

`string`

#### Returns

`void`

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`clearHighlight`](TabAdornmentMethods.md#clearhighlight)

***

### bindHighlight()

```ts
bindHighlight(binder): Disposable;
```

Defined in: [packages/sdk/src/tab-adornment.ts:235](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L235)

#### Parameters

##### binder

[`TabHighlightBinder`](TabHighlightBinder.md)

#### Returns

[`Disposable`](Disposable.md)

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`bindHighlight`](TabAdornmentMethods.md#bindhighlight)

***

### setIndicator()

```ts
setIndicator(targetId, adornment): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:237](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L237)

#### Parameters

##### targetId

`string`

##### adornment

[`TabIndicatorAdornment`](TabIndicatorAdornment.md)

#### Returns

`void`

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`setIndicator`](TabAdornmentMethods.md#setindicator)

***

### clearIndicator()

```ts
clearIndicator(targetId, adornmentId): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:238](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L238)

#### Parameters

##### targetId

`string`

##### adornmentId

`string`

#### Returns

`void`

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`clearIndicator`](TabAdornmentMethods.md#clearindicator)

***

### flashIndicator()

```ts
flashIndicator(targetId, flash): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:239](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L239)

#### Parameters

##### targetId

`string`

##### flash

[`TabIndicatorFlash`](../type-aliases/TabIndicatorFlash.md)

#### Returns

`void`

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`flashIndicator`](TabAdornmentMethods.md#flashindicator)

***

### bindIndicator()

```ts
bindIndicator(binder): Disposable;
```

Defined in: [packages/sdk/src/tab-adornment.ts:240](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L240)

#### Parameters

##### binder

[`TabIndicatorBinder`](TabIndicatorBinder.md)

#### Returns

[`Disposable`](Disposable.md)

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`bindIndicator`](TabAdornmentMethods.md#bindindicator)

***

### setActivity()

```ts
setActivity(targetId, adornment): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:242](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L242)

#### Parameters

##### targetId

`string`

##### adornment

[`TabActivityAdornment`](TabActivityAdornment.md)

#### Returns

`void`

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`setActivity`](TabAdornmentMethods.md#setactivity)

***

### clearActivity()

```ts
clearActivity(targetId, adornmentId): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:243](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L243)

#### Parameters

##### targetId

`string`

##### adornmentId

`string`

#### Returns

`void`

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`clearActivity`](TabAdornmentMethods.md#clearactivity)

***

### flashActivity()

```ts
flashActivity(targetId, flash): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:244](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L244)

#### Parameters

##### targetId

`string`

##### flash

[`TabActivityFlash`](../type-aliases/TabActivityFlash.md)

#### Returns

`void`

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`flashActivity`](TabAdornmentMethods.md#flashactivity)

***

### bindActivity()

```ts
bindActivity(binder): Disposable;
```

Defined in: [packages/sdk/src/tab-adornment.ts:245](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L245)

#### Parameters

##### binder

[`TabActivityBinder`](TabActivityBinder.md)

#### Returns

[`Disposable`](Disposable.md)

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`bindActivity`](TabAdornmentMethods.md#bindactivity)

***

### getIcons()

```ts
getIcons(targetId): TabIconAdornment[];
```

Defined in: [packages/sdk/src/tab-adornment.ts:248](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L248)

All leading icons for `targetId`, in set/bind order.

#### Parameters

##### targetId

`string`

#### Returns

[`TabIconAdornment`](TabIconAdornment.md)[]

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`getIcons`](TabAdornmentMethods.md#geticons)

***

### getHighlight()

```ts
getHighlight(targetId): TabHighlightAdornment | null;
```

Defined in: [packages/sdk/src/tab-adornment.ts:253](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L253)

The whole-tab highlight for `targetId`, or `null` if none. At most one
applies — first found across `set`/`bind` order.

#### Parameters

##### targetId

`string`

#### Returns

[`TabHighlightAdornment`](TabHighlightAdornment.md) \| `null`

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`getHighlight`](TabAdornmentMethods.md#gethighlight)

***

### getIndicators()

```ts
getIndicators(targetId): TabIndicatorAdornment[];
```

Defined in: [packages/sdk/src/tab-adornment.ts:255](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L255)

All trailing indicators for `targetId`, in set/bind/flash order.

#### Parameters

##### targetId

`string`

#### Returns

[`TabIndicatorAdornment`](TabIndicatorAdornment.md)[]

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`getIndicators`](TabAdornmentMethods.md#getindicators)

***

### getActivities()

```ts
getActivities(targetId): TabActivityAdornment[];
```

Defined in: [packages/sdk/src/tab-adornment.ts:257](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L257)

All trailing activities for `targetId`, in set/bind/flash order.

#### Parameters

##### targetId

`string`

#### Returns

[`TabActivityAdornment`](TabActivityAdornment.md)[]

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`getActivities`](TabAdornmentMethods.md#getactivities)

***

### invalidateTabAdornments()

```ts
invalidateTabAdornments(): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:259](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L259)

Signal that binder data changed — re-query `provide` and re-render.

#### Returns

`void`

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`invalidateTabAdornments`](TabAdornmentMethods.md#invalidatetabadornments)

***

### subscribeTabAdornments()

```ts
subscribeTabAdornments(listener): Disposable;
```

Defined in: [packages/sdk/src/tab-adornment.ts:260](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L260)

#### Parameters

##### listener

() => `void`

#### Returns

[`Disposable`](Disposable.md)

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`subscribeTabAdornments`](TabAdornmentMethods.md#subscribetabadornments)

***

### create()

```ts
create(input?): TerminalRecord | undefined;
```

Defined in: [packages/sdk/src/terminal-service.ts:154](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L154)

Open a new terminal in a workspace (defaults to the active one). Returns the
created [TerminalRecord](TerminalRecord.md); the PTY session spawns lazily when its tab
mounts.

Returns `undefined` only when `input.workspaceId` is not given and there is
no active workspace at the time of the call — in normal use this does not
happen because activating any workspace happens before extensions run.

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

Defined in: [packages/sdk/src/terminal-service.ts:160](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L160)

Close and kill every terminal in a workspace. [WorkspaceService.delete](WorkspaceService.md#delete)
reaps terminals the same way automatically, so this is for reaping a
workspace's terminals surgically, without deleting the workspace itself.

#### Parameters

##### workspaceId

`string`

#### Returns

`void`

***

### sendText()

```ts
sendText(
   terminalId, 
   text, 
   addNewline?): void;
```

Defined in: [packages/sdk/src/terminal-service.ts:181](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L181)

Write text to a terminal's PTY as if the user typed it. By default a
carriage return is appended so the line executes; pass `addNewline: false`
to stage text without running it.

Works even if the terminal tab has never been shown: the PTY spawns lazily
on first mount, and `sendText` force-spawns it on demand (a later mount then
attaches to that same session). No-op for an unknown `terminalId`.

#### Parameters

##### terminalId

`string`

The [TerminalRecord.id](TerminalRecord.md#id) to write to.

##### text

`string`

The text to send.

##### addNewline?

`boolean`

Append a carriage return to execute. Defaults to `true`.

#### Returns

`void`

#### Example

```ts
const term = ctx.terminals.create({ cwd: workspaceFolder });
if (term) ctx.terminals.sendText(term.id, "npm run build");
```

***

### close()

```ts
close(terminalId): void;
```

Defined in: [packages/sdk/src/terminal-service.ts:188](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L188)

Close one terminal tab and kill its PTY session. No-op if the id is unknown.
To reap every terminal in a workspace at once use
[TerminalService.closeWorkspace](#closeworkspace).

#### Parameters

##### terminalId

`string`

#### Returns

`void`

***

### rename()

```ts
rename(terminalId, name): void;
```

Defined in: [packages/sdk/src/terminal-service.ts:196](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L196)

Set a terminal's user-facing name ([TerminalRecord.customName](TerminalRecord.md#customname)),
shown on its tab and persisted across restarts. Passing an empty string
clears the custom name, letting the PTY-derived title take over again.
No-op for an unknown `terminalId`.

#### Parameters

##### terminalId

`string`

##### name

`string`

#### Returns

`void`

***

### getTabMenuItems()

```ts
getTabMenuItems(terminalId): MenuEntry[];
```

Defined in: [packages/sdk/src/terminal-service.ts:224](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L224)

The rows of this terminal's tab context menu — **Rename…**, then whatever
extensions contributed on the `"terminal/tab"`
[surface](../type-aliases/MenuSurface.md).

Use it when your own UI lists terminals (an agent list, a session picker)
so right-clicking a row offers the same actions as right-clicking the tab,
contributions included, instead of a menu that drifts from it. Returns an
empty array for a terminal no workspace owns.

#### Parameters

##### terminalId

`string`

#### Returns

[`MenuEntry`](../type-aliases/MenuEntry.md)[]

#### Example

```ts
ctx.ui.showMenu({
  items: [
    { label: "Mark as seen", run: () => ctx.agents.acknowledge(id) },
    { type: "separator" },
    ...ctx.terminals.getTabMenuItems(id),
  ],
  at: { x: e.clientX, y: e.clientY },
});
```

***

### focus()

```ts
focus(terminalId): void;
```

Defined in: [packages/sdk/src/terminal-service.ts:226](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L226)

#### Parameters

##### terminalId

`string`

#### Returns

`void`

***

### ~~registerTabDecoration()~~

```ts
registerTabDecoration(provider): Disposable;
```

Defined in: [packages/sdk/src/terminal-service.ts:232](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L232)

#### Parameters

##### provider

[`TerminalTabDecorationProvider`](TerminalTabDecorationProvider.md)

#### Returns

[`Disposable`](Disposable.md)

#### Deprecated

Prefer [TerminalService.bindIndicator](TabAdornmentMethods.md#bindindicator). Thin shim that
registers a trailing-indicator binder for terminal tabs only.

***

### ~~getTabDecoration()~~

```ts
getTabDecoration(terminalId): 
  | TabIndicatorContribution
  | null;
```

Defined in: [packages/sdk/src/terminal-service.ts:238](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L238)

#### Parameters

##### terminalId

`string`

#### Returns

  \| [`TabIndicatorContribution`](../type-aliases/TabIndicatorContribution.md)
  \| `null`

#### Deprecated

Prefer [TerminalService.getIndicators](TabAdornmentMethods.md#getindicators). Returns the first
trailing indicator for a terminal tab, or `null`.

***

### ~~invalidateTabDecorations()~~

```ts
invalidateTabDecorations(): void;
```

Defined in: [packages/sdk/src/terminal-service.ts:243](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L243)

#### Returns

`void`

#### Deprecated

Prefer [TerminalService.invalidateTabAdornments](TabAdornmentMethods.md#invalidatetabadornments).

***

### ~~subscribeTabDecorations()~~

```ts
subscribeTabDecorations(listener): Disposable;
```

Defined in: [packages/sdk/src/terminal-service.ts:248](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L248)

#### Parameters

##### listener

() => `void`

#### Returns

[`Disposable`](Disposable.md)

#### Deprecated

Prefer [TerminalService.subscribeTabAdornments](TabAdornmentMethods.md#subscribetabadornments).

***

### subscribeOsc()

```ts
subscribeOsc(
   terminalId, 
   handler, 
   options?): Disposable;
```

Defined in: [packages/sdk/src/terminal-service.ts:293](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L293)

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

(`event`, `origin`) => `void`

##### options?

[`SubscribeOutputOptions`](SubscribeOutputOptions.md)

#### Returns

[`Disposable`](Disposable.md)

#### Example

```ts
// Detect Claude Code busy/idle state from OSC 0 title sequences: it
// prefixes the title with an animated spinner glyph while busy, and with
// the idle char below when awaiting input. Accept both spinner ranges —
// current builds animate the half-filled circles ◐/◑, older ones used
// braille (which Codex CLI still does).
const SPINNERS = [
  [0x25d0, 0x25d3], // ◐ ◑ ◒ ◓
  [0x2800, 0x28ff], // ⠋ ⠙ ⠏ …
];
const IDLE_CHAR     = '\u2733'; // ✳

const sub = ctx.terminals.subscribeOsc(terminalId, ({ code, payload }) => {
  if (code !== 0) return;
  const first = payload.charCodeAt(0);
  const spinning = SPINNERS.some(([lo, hi]) => first >= lo && first <= hi);
  if (spinning)                           setStatus('busy');
  else if (payload.startsWith(IDLE_CHAR)) setStatus('idle');
});
ctx.subscriptions.push(sub);
```

#### Remarks

OSC sequences ride the raw output stream, so the same replay rule applies
as for [TerminalService.subscribeOutput](#subscribeoutput): by default only sequences
from **live** output are delivered, and `{ includeReplay: true }` adds
those found in the scrollback replayed on attach. Status titles are the
usual reason to leave it off — a replayed "busy" title describes a turn
that is already over.

***

### subscribeOutput()

```ts
subscribeOutput(
   terminalId, 
   handler, 
   options?): Disposable;
```

Defined in: [packages/sdk/src/terminal-service.ts:350](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L350)

Subscribe to the raw PTY output stream of the terminal identified by
`terminalId`. The `handler` is called with every chunk of bytes the PTY
produces — including ANSI escape sequences, OSC sequences, and all other
control characters — exactly as they arrive, with no parsing or filtering.

This fires even when the terminal's panel is not visible, so it is suitable
for background monitoring (e.g. detecting output activity to confirm an
agent is still running). Keep handlers lightweight: they execute
synchronously on every PTY chunk, which can be multiple times per second
while a program is active.

The subscription is keyed to the **terminal record id** (e.g. `"term_…"`),
not the underlying PTY session id, so it survives terminal recreation within
the same record.

By default only **live** output is delivered. A terminal session outlives
the app, so attaching to one replays its recent scrollback; without this
default every reattach would look like a burst of activity happening right
now. Pass `{ includeReplay: true }` to receive that history too — each
chunk then arrives with an [OutputOrigin](OutputOrigin.md) saying which kind it is.

Returns a [Disposable](Disposable.md) that cancels the subscription.

#### Parameters

##### terminalId

`string`

##### handler

(`data`, `origin`) => `void`

##### options?

[`SubscribeOutputOptions`](SubscribeOutputOptions.md)

#### Returns

[`Disposable`](Disposable.md)

#### Examples

```ts
// Track the last time any output arrived to confirm agent activity.
// Replayed scrollback is excluded by default, so re-attaching to a
// long-idle terminal doesn't read as fresh activity.
let lastOutputAt = 0;
const sub = ctx.terminals.subscribeOutput(terminalId, () => {
  lastOutputAt = Date.now();
});
ctx.subscriptions.push(sub);
```

```ts
// Opt in to the replayed scrollback — needed to work out what is running
// in a terminal you just attached to — and keep the two apart.
const sub = ctx.terminals.subscribeOutput(
  terminalId,
  (chunk, { replay }) => {
    identifyProgram(chunk);           // history is evidence
    if (!replay) noteActivity();      // …but only live output is activity
  },
  { includeReplay: true },
);
ctx.subscriptions.push(sub);
```

***

### getActive()

```ts
getActive(): string | null;
```

Defined in: [packages/sdk/src/terminal-service.ts:363](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L363)

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

Defined in: [packages/sdk/src/terminal-service.ts:385](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L385)

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
