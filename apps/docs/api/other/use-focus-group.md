# useFocusGroup

Headless keyboard navigation for a **focus group** — a set of peer items that
share a single tab stop and move with the arrow keys (a list, listbox, menu,
toolbar, tablist, radio group, or flat grid). You keep the markup and semantics
(`role`, `aria-*`, `onClick`, styling); the hook supplies the behavior every such
widget needs and gets the fiddly bits right.

It owns, once and correctly: the single-tab-stop `tabIndex` (so the group is one
Tab stop and the host's "focus the first tabbable" entry lands on `start`); arrow
/ Home / End movement (per `orientation`, wrapping per `wrap`, skipping
non-navigable items); `Enter`/`Space` → `onActivate` and the context-menu key /
`Shift`+`F10` → `onMenu`; and a **WebKit-safe, keyboard-only focus ring** — it
flags the active item with a `data-focus-visible` attribute (state-driven,
because WebKit won't repaint `:focus` for the programmatic focus the host's
region cycle performs) and the host ships the ring CSS keyed on it, so every
group's ring is identical and theme-correct without you styling it.

```ts
import { useFocusGroup } from "@silo-code/sdk";

useFocusGroup(options: FocusGroupOptions): FocusGroup
```

## Example

```tsx
import { useFocusGroup } from "@silo-code/sdk";

function List({ items, ctx }) {
  const activeIndex = items.findIndex((it) => it.selected);
  const group = useFocusGroup({
    count: items.length,
    start: activeIndex >= 0 ? activeIndex : 0, // entry parks on the selected row
    onActivate: (i) => ctx.workspaces.activate(items[i].id), // Enter / Space
    onMenu: (i, anchor) =>
      ctx.ui.showMenu({ anchor, items: menuFor(items[i]) }),
  });

  return (
    <ul role="listbox" {...group.containerProps}>
      {items.map((it, i) => (
        <li key={it.id} role="option" {...group.getItemProps(i)}>
          {it.label}
        </li>
      ))}
    </ul>
  );
}
```

Spread [`containerProps`](/api/types/interfaces/FocusGroup#containerprops) on the
wrapper and [`getItemProps(i)`](/api/types/interfaces/FocusGroup#getitemprops) on
each item. The index is clamped when
[`count`](/api/types/interfaces/FocusGroupOptions#count) changes, so live-filtering
a list is safe. A row's inline controls (a delete button) should carry
`tabIndex={-1}` to stay out of the tab order; reach them from the row's context
menu instead.

## Types

- [`FocusGroupOptions`](/api/types/interfaces/FocusGroupOptions) — `count`,
  `start`, [`orientation`](/api/types/type-aliases/FocusGroupOrientation), `wrap`,
  `isNavigable`, `onActivate`, `onMenu`.
- [`FocusGroup`](/api/types/interfaces/FocusGroup) — `containerProps`,
  `getItemProps(i)`, `activeIndex`, `focusItem(i)`.

## See also

- [Keyboard navigation in a panel](/guide/keyboard-navigation) — the full guide
  (a Task-list panel, how the list composes with a search box and buttons).
- [`useServiceState`](/api/other/use-service-state) — the SDK's other runtime hook.
- Other [Other](/api/#other) members on `ctx`.
