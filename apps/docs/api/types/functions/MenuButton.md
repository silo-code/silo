# Function: MenuButton()

```ts
function MenuButton(__namedParameters): Element;
```

Defined in: [packages/sdk/src/MenuButton.tsx:61](https://github.com/silo-code/silo/blob/main/packages/sdk/src/MenuButton.tsx#L61)

A **labelled** button that opens a menu — the counterpart to
[IconButton](IconButton.md) for the cases where a bare `⋮` doesn't tell anyone what
they'd get. Renders its label with a trailing chevron, the standard signal
that pressing it reveals more rather than performing something.

Reach for this over `IconButton` whenever the menu is a place a user is
*meant* to go rather than an escape hatch: a `⋮` is discoverable only by the
people who already know to look. Keep `IconButton` for dense rows and
toolbars where a label won't fit.

It is the trigger only — it does not own the menu. Open one from `onClick`
with [UiService.showMenu](../interfaces/UiService.md#showmenu), anchoring to `e.currentTarget` so the menu
lines up under the button.

Styled purely via host-provided `.silo-menu-button*` classes — no stylesheet
import is needed in the extension. `variant="field"` gives it `Input` /
`Select` chrome (border, full width, trailing chevron) for use as a value
picker in a form, where a rich menu (icons, checks) beats a native `<select>`.

## Parameters

### \_\_namedParameters

`object` & `Omit`\<`ButtonHTMLAttributes`\<`HTMLButtonElement`\>, `"children"`\>

## Returns

`Element`

## Example

```tsx
<MenuButton
  label="More"
  onClick={(e) =>
    ctx.ui.showMenu({
      items: [
        { id: "disable", label: "Disable", run: disable },
        { id: "uninstall", label: "Uninstall", run: uninstall },
      ],
      at: e.currentTarget,
    })
  }
/>

// compact — e.g. in a card footer or a ListRow's trailing slot
<MenuButton size="sm" label="More" onClick={openMenu} />

// as a form field — a value picker inside a `Section`
<MenuButton
  variant="field"
  label={agent?.displayName ?? "Auto-detect"}
  onClick={(e) => ctx.ui.showMenu({ anchor: e.currentTarget, items })}
>
  <AgentIconGlyph icon={agent?.icon} mode="color" colorScheme={scheme} />
</MenuButton>
```
