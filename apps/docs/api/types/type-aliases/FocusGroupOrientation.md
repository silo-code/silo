# Type Alias: FocusGroupOrientation

```ts
type FocusGroupOrientation = "vertical" | "horizontal" | "grid";
```

Defined in: [packages/sdk/src/use-focus-group.ts:22](https://github.com/silo-code/silo/blob/main/packages/sdk/src/use-focus-group.ts#L22)

The arrow-key axis a [useFocusGroup](../functions/useFocusGroup.md) navigates.

- `"vertical"` — ↑/↓ move between items (lists, menus, listboxes).
- `"horizontal"` — ←/→ move between items (toolbars, tablists, button groups).
- `"grid"` — all four arrows step linearly through the items (a flat picker);
  `Home`/`End` still jump to the ends regardless of orientation.
