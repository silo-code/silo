# ctx.registerToolbarItem

Add a control to the **trailing cluster** of a host-drawn toolbar — the editor
breadcrumb (beside the Text | Preview switcher), the Navigator header, or a
[dock panel that declares `toolbar`](/api/registration/register-dock-panel-kind#host-drawn-chrome-a-breadcrumb-a-contribution-point),
the built-in **terminal** included.
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

One `surface` (`"editor"` | `"navigator"` | `"panel"`) per registration.
Interactive items set exactly one of `command` or `menu`; a command item may
also set `dropdown` to become a [split control](#split-control-action--dropdown).
Non-interactive chrome uses `type: "separator"` (light hairline) or
`type: "spacer"` (`sm` / `md` / `lg`).

A `"panel"` item's target is `{ panelId, kindId, params }` — scope it to one
kind of dock panel with `when: (_keys, t) => t.kindId === "acme.chat"` (or it
shows on every panel that has a toolbar), and read instance data off
`t.params`. The built-in terminal is a `"panel"` kind, so a terminal toolbar
item is `surface: "panel"`, `when: t => t.kindId === "terminal"`, with the id at
`t.params.terminalId`.

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

## Split control: action + dropdown

When a toolbar has one obvious default action plus variations on it — "mark
with the default label" alongside "mark with…" — add `dropdown` to a **command**
item. The host welds the two into a single control: clicking the left half runs
`command`, clicking the caret on the right opens `dropdown.menu`.

```ts
ctx.subscriptions.push(
  ctx.registerToolbarItem({
    id: "acme.flag.panel",
    surface: "panel",
    command: "acme.toggleFlag", // the action half
    icon: "Flag",
    tooltip: "Flag: Bug",
    checked: (_k, t) => acmeStore.isFlagged(t.panelId),
    dropdown: {
      // the caret half
      menu: (target) => [
        { label: "Bug", run: () => acmeStore.flag(target.panelId, "bug") },
        {
          label: "Review",
          run: () => acmeStore.flag(target.panelId, "review"),
        },
        { type: "separator" },
        { label: "Clear", run: () => acmeStore.clear(target.panelId) },
      ],
      label: "Flag options",
      tooltip: "Flag options",
    },
  }),
);
```

The dropdown carries its own `label` / `tooltip` because the halves answer
different questions — what clicking _does_ versus what opening _offers_. Omit
`label` and the caret is named after the control with `options` appended
("Flag options").

Prefer this over registering two adjacent items. Two items are two
contributions: the host is free to order other extensions' chrome between them,
and they carry two independent hover and checked states. A split control is one
contribution that appears, hides (`when`), and highlights as a unit —
`checked` describes the command, but the host tints the whole control, caret
included.

Reach for it only when the dropdown genuinely _refines_ the default action. If
the caret would open unrelated commands, that's a separate menu item.

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
[`ToolbarItemDropdown`](/api/types/interfaces/ToolbarItemDropdown) ·
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
