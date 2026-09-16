# usePanelEntryFocus

**Entry focus** for a dock panel — landing the keyboard caret in your panel's
content whenever the user enters the panel, and releasing it when they leave.
If your panel has one obvious thing to type into (a chat composer, a search box,
an editor), this is how it takes the cursor.

Getting that right by hand is deceptively hard, and the hook owns all of it:
both of the events that mean "the user entered this panel", the guard that keeps
a background panel from stealing focus, and the frame-by-frame retry that wins
dockview's focus shuffle. A single `focus()` call loses that shuffle — the
classic symptom is a panel that needs a second click before you can type.

```ts
import { usePanelEntryFocus } from "@silo-code/sdk";

usePanelEntryFocus(api: DockPanelApi, target: PanelEntryFocusTarget): () => void
```

## Example

```tsx
import { usePanelEntryFocus, type DockPanelProps } from "@silo-code/sdk";

function AcmeChatPanel({ api }: DockPanelProps) {
  const input = useRef<HTMLTextAreaElement | null>(null);

  usePanelEntryFocus(api, {
    focus: () => input.current?.focus(),
    isFocused: () => document.activeElement === input.current,
  });

  return <textarea ref={input} />;
}
```

That's the whole integration for a plain input. Pass
[`api`](/api/types/interfaces/DockPanelProps#api) straight through from your
panel's props.

## What it handles

**Both entry signals.** Clicking a panel's tab when that tab is _already active_
changes nothing about which panel is active, so dockview emits no
[`onDidActiveChange`](/api/types/interfaces/DockPanelApi) at all — even though
that click is the commonest way a user asks for the cursor back (they were
typing in a side panel, clicked the status bar, then clicked your tab).
[`onDidRequestFocus`](/api/types/interfaces/DockPanelApi) is that gesture. The
hook subscribes to both, so a real activation and a click-back land focus
identically.

**The `isActive` guard.** Focus is only ever taken while your panel is the
active one, both up front and for the life of each retry. Mount is not "the user
just created this panel" — re-entering a workspace re-mounts every panel in its
dock — and DOM focus landing inside a panel makes dockview activate that panel's
group, so an unguarded grab silently changes which tab the user is looking at.

**The retry.** Focus is re-asserted across animation frames until `isFocused()`
says it landed, up to roughly 330ms. It stands down early if your panel stops
being active, or if focus moves into an open context menu — so right-clicking an
inactive panel doesn't yank focus out of the menu that click just opened.

**Release on exit.** The optional `blur` runs when your tab is deactivated. Only
content that tracks its own focus state internally needs it: a code editor or
terminal is kept alive (hidden) while its tab is inactive, and a tracker stuck
believing it still has focus will swallow keystrokes meant for the tab the user
switched to. A plain input needs nothing.

## Focusing at some other moment

The hook returns a referentially stable function that runs the same guarded
retry on demand — for content that becomes focusable at a moment that is neither
a mount nor an activation:

```tsx
const focusComposer = usePanelEntryFocus(api, { focus, isFocused });

// The session finished connecting and the composer accepts input now.
useEffect(() => {
  if (ready) focusComposer();
}, [ready, focusComposer]);
```

Every callback on the target is read fresh each time it's invoked, so inline
closures over props or state are always current — you never need to memoize
them.

## Types

- [`PanelEntryFocusTarget`](/api/types/interfaces/PanelEntryFocusTarget) —
  `focus`, `isFocused`, `blur`.
- [`DockPanelApi`](/api/types/interfaces/DockPanelApi) — the panel api the hook
  subscribes to, including `onDidRequestFocus`.

## See also

- [`ctx.registerDockPanelKind`](/api/registration/register-dock-panel-kind) —
  registering the panel this hook focuses.
- [`useFocusGroup`](/api/other/use-focus-group) — keyboard navigation _within_
  a group of items, once focus has arrived.
- [`useServiceState`](/api/other/use-service-state) — the SDK's other runtime hook.
- Other [Other](/api/#other) members on `ctx`.
