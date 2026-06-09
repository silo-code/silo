# focusGroupNextIndex

The pure roving-index core of [`useFocusGroup`](/api/other/use-focus-group):
given the current index and a pressed key, it returns the index a list/menu
highlight should move to — stepping over non-navigable items, wrapping (or
stopping) at the ends, with `Home`/`End` jumping to the first/last navigable row.

**Prefer [`useFocusGroup`](/api/other/use-focus-group)** for an ordinary
list or toolbar — it calls this for you and also owns the tab stop, focus, and
ring. Reach for `focusGroupNextIndex` directly only when you _can't_ use the
hook: a widget that drives keys from a document-level listener and a
state-driven highlight rather than DOM focus (Silo's own menus work this way,
because a menu opens hidden and WebKit won't move focus into a hidden node).

```ts
import { focusGroupNextIndex } from "@silo-code/sdk";

focusGroupNextIndex(query: FocusGroupNavQuery): number | null
```

## Example

```ts
import { focusGroupNextIndex } from "@silo-code/sdk";

function onKeyDown(e: KeyboardEvent) {
  const next = focusGroupNextIndex({
    current: activeIndex,
    count: rows.length,
    key: e.key,
    orientation: "vertical",
    wrap: true,
    isNavigable: (i) => rows[i].type === "item" && !rows[i].disabled,
  });
  if (next !== null) {
    e.preventDefault();
    setActiveIndex(next); // move a state-driven highlight; no DOM focus needed
  }
}
```

## Types

Takes a [`FocusGroupNavQuery`](/api/types/interfaces/FocusGroupNavQuery)
(`current`, `count`, `key`,
[`orientation`](/api/types/type-aliases/FocusGroupOrientation), `wrap`,
`isNavigable`) and returns the next index, or `null` when the key isn't a
navigation key, the list is empty, or there's nowhere else to go.

## See also

- [`useFocusGroup`](/api/other/use-focus-group) — the hook this powers; use it
  unless you specifically can't.
- [Keyboard navigation in a panel](/guide/keyboard-navigation) — the guide.
