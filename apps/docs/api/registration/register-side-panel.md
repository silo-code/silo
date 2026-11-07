# ctx.registerSidePanel

Add a panel to the left or right side column (like the file explorer or git panel).

```ts
ctx.registerSidePanel(panel: SidePanel): Disposable
```

## Example

```tsx
import { ListTree } from "@phosphor-icons/react";

ctx.registerSidePanel({
  id: "acme.outline",
  location: "left",
  title: "Outline",
  icon: <ListTree size="1em" weight="duotone" />,
  component: OutlinePanel, // receives SidePanelProps (active, storage, hydrated)
  lazyMount: true,
});
```

If your panel would be _another way to navigate the app_, register a
[Navigator view](/api/registration/register-navigator-view) instead — two
navigators side by side leave the user with no rule for which one to trust.

## The tab icon

`icon` is optional artwork for the panel's tab. Supplying it does not mean it is
shown: the **user** right-clicks the tab and picks whether it renders the icon,
the title, or both — so always give the panel a meaningful `title` too. The
default is title-only, and a panel with no `icon` has no icon options in that
menu at all.

Match the rest of Silo's chrome: a Phosphor icon at `weight="duotone"` and
`size="1em"`. The `em` matters — it keeps the icon tracking the user's UI font
size. A hand-authored inline SVG is fine where no Phosphor glyph fits; draw it
in `currentColor` so it themes with the tab, and layer it at two opacities to
stay in the same two-tone family.

The choice applies to that tab in every workspace.

## Types

Pass [`SidePanel`](/api/types/interfaces/SidePanel).

Related: [`SidePanelProps`](/api/types/interfaces/SidePanelProps) · [`SidePanelTabDisplay`](/api/types/type-aliases/SidePanelTabDisplay) · [`ExtensionStorage`](/api/types/interfaces/ExtensionStorage).

## See also

Other [Registration](/api/#registration) members on `ctx`.
