# Function: useFocusGroup()

```ts
function useFocusGroup(options): FocusGroup;
```

Defined in: [packages/sdk/src/use-focus-group.ts:269](https://github.com/silo-code/silo/blob/main/packages/sdk/src/use-focus-group.ts#L269)

Headless keyboard navigation for a **focus group** — a set of peer items that
share a single tab stop and move with the arrow keys (a list, listbox, menu,
toolbar, tablist, radio group, or flat grid). It owns, once and correctly, the
mechanics every such widget needs:

- a single-tab-stop `tabIndex` (one item tabbable, the rest `-1`), so the group
  is one Tab stop and the host's "focus the first tabbable" entry lands on
  [start](../interfaces/FocusGroupOptions.md#start);
- Arrow / Home / End movement (per
  [orientation](../interfaces/FocusGroupOptions.md#orientation), wrapping or stopping per
  [wrap](../interfaces/FocusGroupOptions.md#wrap), skipping non-navigable items);
- `Enter`/`Space` → [onActivate](../interfaces/FocusGroupOptions.md#onactivate), the
  context-menu key / `Shift`+`F10` → [onMenu](../interfaces/FocusGroupOptions.md#onmenu);
- a **WebKit-safe, keyboard-only focus ring**: it flags the active item with a
  `data-focus-visible` attribute (state-driven, because WebKit won't repaint
  `:focus` for the programmatic focus the host's region cycle performs), and
  the host ships the ring CSS keyed on that attribute — so every group's ring
  is identical and correct without the author touching it.

You keep the markup and semantics (`role`, `aria-*`, `onClick`, styling); the
hook supplies behavior. Spread [containerProps](../interfaces/FocusGroup.md#containerprops)
on the wrapper and [getItemProps(i)](../interfaces/FocusGroup.md#getitemprops) on each
item. The index is clamped when [count](../interfaces/FocusGroupOptions.md#count) changes,
so live-filtering a list is safe.

## Parameters

### options

[`FocusGroupOptions`](../interfaces/FocusGroupOptions.md)

## Returns

[`FocusGroup`](../interfaces/FocusGroup.md)

## Example

```tsx
const group = useFocusGroup({
  count: items.length,
  start: activeIndex,
  onActivate: (i) => select(items[i].id),
  onMenu: (i, anchor) => showMenu(items[i], anchor),
});
return (
  <ul {...group.containerProps}>
    {items.map((it, i) => (
      <li key={it.id} {...group.getItemProps(i)}>{it.label}</li>
    ))}
  </ul>
);
```
