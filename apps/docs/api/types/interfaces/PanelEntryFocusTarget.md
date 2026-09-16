# Interface: PanelEntryFocusTarget

Defined in: [packages/sdk/src/use-panel-entry-focus.ts:113](https://github.com/silo-code/silo/blob/main/packages/sdk/src/use-panel-entry-focus.ts#L113)

The content [usePanelEntryFocus](../functions/usePanelEntryFocus.md) drives — how to focus it, how to tell
whether it already has focus, and optionally how to release it.

All three are called through a latest-ref, so inline closures over props or
state are always current; you never need to memoize them.

## Properties

### focus

```ts
focus: () => void;
```

Defined in: [packages/sdk/src/use-panel-entry-focus.ts:119](https://github.com/silo-code/silo/blob/main/packages/sdk/src/use-panel-entry-focus.ts#L119)

Imperatively focus the panel's content — e.g. `() => inputRef.current?.focus()`
or `() => editor.focus()`. Safe to make a no-op while the content isn't
ready to take focus; the retry simply expires.

#### Returns

`void`

***

### isFocused

```ts
isFocused: () => boolean;
```

Defined in: [packages/sdk/src/use-panel-entry-focus.ts:130](https://github.com/silo-code/silo/blob/main/packages/sdk/src/use-panel-entry-focus.ts#L130)

Whether the content holds DOM keyboard focus **right now**, so the retry
can stop as soon as it lands instead of burning the whole frame budget.

Read the live `document.activeElement` — e.g.
`() => document.activeElement === inputRef.current`. Don't trust a
library's own tracker flag (Monaco's `hasTextFocus()`, say): those go
stale-true when a blur is dropped during dockview's show/hide shuffle,
which stops the retry believing focus landed when it didn't.

#### Returns

`boolean`

***

### blur?

```ts
optional blur?: () => void;
```

Defined in: [packages/sdk/src/use-panel-entry-focus.ts:139](https://github.com/silo-code/silo/blob/main/packages/sdk/src/use-panel-entry-focus.ts#L139)

Release the content's focus when the panel's tab is deactivated. Only
needed for content that tracks its own focus state internally — a Monaco
editor or an xterm terminal is kept alive (hidden) while its tab is
inactive, and if its tracker stays stuck believing it has focus it will
steal keystrokes meant for the tab you switched to. A plain input needs
nothing here.

#### Returns

`void`
