# Function: focusGroupNextIndex()

```ts
function focusGroupNextIndex(params): number | null;
```

Defined in: [packages/sdk/src/use-focus-group.ts:179](https://github.com/silo-code/silo/blob/main/packages/sdk/src/use-focus-group.ts#L179)

The index a navigation key moves focus to within a focus group, or `null` when
the key isn't a navigation key for this orientation, the list is empty, or no
other navigable item exists. Steps over non-navigable items; wraps at the ends
when `wrap`, otherwise stops (returns `null`). `Home`/`End` jump to the
first/last navigable index regardless of orientation.

This is the pure roving-index core that [useFocusGroup](useFocusGroup.md) runs internally.
Reach for it directly only when you **can't** use the hook — e.g. a widget that
drives keys from a document-level listener and a state-driven highlight rather
than DOM focus (Silo's menus work this way). For an ordinary list/toolbar,
prefer [useFocusGroup](useFocusGroup.md), which calls this for you.

## Parameters

### params

[`FocusGroupNavQuery`](../interfaces/FocusGroupNavQuery.md)

## Returns

`number` \| `null`

## Example

```ts
const next = focusGroupNextIndex({
  current: activeIndex, count: items.length, key: e.key,
  orientation: "vertical", wrap: true,
  isNavigable: (i) => !items[i].disabled,
});
if (next !== null) setActiveIndex(next);
```
