# Function: usePanelEntryFocus()

```ts
function usePanelEntryFocus(api, target): () => void;
```

Defined in: [packages/sdk/src/use-panel-entry-focus.ts:200](https://github.com/silo-code/silo/blob/main/packages/sdk/src/use-panel-entry-focus.ts#L200)

Land keyboard focus in a dock panel's content whenever the user enters the
panel, winning dockview's focus shuffle — and, symmetrically, release it when
the panel's tab is deactivated.

A panel that puts the cursor somewhere on entry (a chat composer, a search
box, an editor) needs three things that are easy to get individually wrong,
and this hook is all three in one call:

1. **Both entry signals.** [DockPanelApi.onDidActiveChange](../interfaces/DockPanelApi.md#ondidactivechange) covers real
   activations. [DockPanelApi.onDidRequestFocus](../interfaces/DockPanelApi.md#ondidrequestfocus) covers a click on a
   tab that was *already* active — dockview treats that as a complete no-op
   and fires no active-change event, even though it is the commonest way a
   user asks for the cursor back (they were typing in a side panel, clicked
   the status bar, then clicked your tab).
2. **A guard.** Focus is only ever taken while the panel is the active one.
   Mount is not "the user just created this panel" — re-entering a workspace
   re-mounts every panel in its dock — and DOM focus landing in a panel makes
   dockview activate its group, so an unguarded grab silently changes the
   visible tab (ADR 0034).
3. **A retry.** A single `focus()` loses dockview's shuffle, and rich content
   only accepts focus once its internal textarea is laid out. The hook
   retries across frames until focus lands, standing down if the panel stops
   being active or focus moves into an open context menu.

```tsx
function AcmeChatPanel({ api }: DockPanelProps) {
  const input = useRef<HTMLTextAreaElement | null>(null);

  usePanelEntryFocus(api, {
    focus: () => input.current?.focus(),
    isFocused: () => document.activeElement === input.current,
  });

  return <textarea ref={input} />;
}
```

The returned function runs the same guarded retry on demand, for content that
becomes focusable at a moment that is neither a mount nor an activation — a
session finishing its connect, an editor finishing its own mount. It is
referentially stable, so it is safe in a dependency array:

```tsx
const focusComposer = usePanelEntryFocus(api, { focus, isFocused });

useEffect(() => {
  if (ready) focusComposer();
}, [ready, focusComposer]);
```

## Parameters

### api

[`DockPanelApi`](../interfaces/DockPanelApi.md)

The surrounding panel's api ([DockPanelProps.api](../interfaces/DockPanelProps.md#api)).

### target

[`PanelEntryFocusTarget`](../interfaces/PanelEntryFocusTarget.md)

How to focus, test, and release the panel's content.

## Returns

A stable callback that runs the guarded focus retry on demand.

() => `void`
