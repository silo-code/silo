# ctx.registerToolbarItem

Add a control to the **trailing cluster** of a built-in editor or terminal
toolbar (beside the host-owned Text | Preview switcher on editors).
Independent of [`registerContextMenuItem`](/api/registration/register-context-menu-item)
— register either, both, or neither.

Hosts only render contributions while that surface's **breadcrumbs** setting is
on. Call [`invalidateToolbarItems`](#invalidatetoolbaritems) when `when` /
`checked` data changes outside a panel re-render.

```ts
ctx.registerToolbarItem<S extends ToolbarSurface>(
  item: ToolbarItemContribution<S>,
): Disposable

ctx.invalidateToolbarItems(): void
```

One `surface` (`"editor"` | `"terminal"`) per registration. Interactive items
set exactly one of `command` or `menu`. Non-interactive chrome uses
`type: "separator"` (light hairline) or `type: "spacer"` (`sm` / `md` / `lg`).

## Chrome: icon / text / both

| `icon` | `title` | Control     |
| ------ | ------- | ----------- |
| ✓      | —       | icon-only   |
| —      | ✓       | text-only   |
| ✓      | ✓       | icon + text |

`icon` is a **Phosphor export name** (`PhosphorIconName`), e.g. `"Flag"` or
`"ArrowClockwise"` — not a React element. The host resolves it and paints
`weight="bold"` `size="1em"` so glyphs match local-web-viewer and track Zoom.

## Command example

```ts
ctx.registerCommand({
  id: "acme.toggleFlag",
  label: "Acme: Flag",
  run: (...args) => {
    const { editorId } = args[0] as { editorId: string };
    acmeStore.toggle(editorId);
    ctx.invalidateToolbarItems();
  },
});

ctx.subscriptions.push(
  ctx.registerToolbarItem({
    id: "acme.flag.editor",
    surface: "editor",
    command: "acme.toggleFlag",
    icon: "Flag",
    title: "Flag", // omit for icon-only
    tooltip: "Flag",
    checked: (_k, t) => acmeStore.isFlagged(t.editorId),
  }),
);
```

## Dropdown example

```ts
ctx.subscriptions.push(
  ctx.registerToolbarItem({
    id: "acme.actions.editor",
    surface: "editor",
    icon: "Flag",
    title: "Actions",
    menu: (target) => [
      {
        label: "Flag",
        checked: acmeStore.isFlagged(target.editorId),
        run: () => {
          acmeStore.toggle(target.editorId);
          ctx.invalidateToolbarItems();
        },
      },
      { type: "separator" },
      {
        label: "Clear",
        disabled: !acmeStore.isFlagged(target.editorId),
        run: () => {
          acmeStore.clear(target.editorId);
          ctx.invalidateToolbarItems();
        },
      },
    ],
  }),
);
```

The host opens the menu with `ctx.ui.showMenu` (`align: "end"`, toggle on) and
draws a caret on menu-backed controls.

## Separator / spacer

```tsx
ctx.registerToolbarItem({
  type: "separator",
  id: "acme.sep",
  surface: "editor",
  order: 20,
});

ctx.registerToolbarItem({
  type: "spacer",
  id: "acme.gap",
  surface: "editor",
  size: "md", // sm | md | lg
  order: 25,
});
```

The separator is a soft hairline (`toolbar-text` at ~22% opacity) — lighter than
the Text | Preview pipe. The host collapses adjacent separators/spacers and
strips leading/trailing chrome.

## Types

[`ToolbarItemContribution`](/api/types/type-aliases/ToolbarItemContribution) ·
[`ToolbarCommandItemContribution`](/api/types/interfaces/ToolbarCommandItemContribution) ·
[`ToolbarMenuItemContribution`](/api/types/interfaces/ToolbarMenuItemContribution) ·
[`ToolbarSeparatorContribution`](/api/types/interfaces/ToolbarSeparatorContribution) ·
[`ToolbarSpacerContribution`](/api/types/interfaces/ToolbarSpacerContribution) ·
[`PhosphorIconName`](/api/types/type-aliases/PhosphorIconName) ·
[`ToolbarSurface`](/api/types/type-aliases/ToolbarSurface) ·
[`ToolbarItemContext`](/api/types/interfaces/ToolbarItemContext)

## See also

- [`registerContextMenuItem`](/api/registration/register-context-menu-item) — tab menus (same command, always available).
- [Tab adornments](/api/state/tab-adornments) — leading icon / trailing indicator on the tab itself.
- [`ctx.ui.showMenu`](/api/ui/) — menu chrome reused by dropdown items.
- [RFC 0021](https://github.com/silo-code/silo/blob/main/docs/proposals/0021-follow-ups-extension-sdk.md)
