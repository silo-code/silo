# Buttons

## Button

The action button, in three variants. In a modal footer, the primary action
sits rightmost with neutral actions to its left (see
[`ModalActions`](/design/components/structure#modalactions)).

<div class="silo-demo">
  <button class="silo-button">Cancel</button>
  <button class="silo-button-primary">Save</button>
  <button class="silo-button-danger">Delete</button>
  <button class="silo-button silo-button-sm">Compact</button>
  <button class="silo-button-primary" disabled>Disabled</button>
</div>

```tsx
import { Button } from "@silo-code/sdk";

<Button onClick={cancel}>Cancel</Button>
<Button variant="primary" onClick={save}>Save</Button>
<Button variant="danger" onClick={remove}>Delete</Button>
<Button size="sm">Compact</Button>
```

| Prop      | Type                                | Default    | Notes                                                                              |
| --------- | ----------------------------------- | ---------- | ---------------------------------------------------------------------------------- |
| `variant` | `"normal" \| "primary" \| "danger"` | `"normal"` | `primary` = the accent-filled main action (one per footer); `danger` = destructive |
| `size`    | `"normal" \| "sm"`                  | `"normal"` | `sm` for inline/compact contexts (e.g. a footer `start` slot)                      |
| …rest     | `React.ComponentProps<"button">`    |            | `disabled`, `onClick`, etc. pass through                                           |

**States** (all built in — don't restyle):

- Hover: variant fill shifts one shade (normal buttons shade toward black in
  dark themes and toward white in light themes; primary/danger always toward
  black).
- Pressed: a further shade plus a slight scale-down.
- Disabled: 50% opacity, inert — no hover, no press animation, no clicks.
- Focus: the shared 1px inset accent ring. Never add your own.

| Color                | Token                                                                |
| -------------------- | -------------------------------------------------------------------- |
| Normal fill / text   | `--silo-button-bg` / `--silo-button-text`                            |
| Primary fill / text  | `--silo-button-primary-bg` (→ accent) / `--silo-button-primary-text` |
| Danger fill / text   | `--silo-button-danger-bg` (→ err) / `--silo-button-danger-text`      |
| Hover / active fills | derived (`color-mix` of the variant fill)                            |

## IconButton

A square icon-only button — the kit's one answer for ✕, ⋮, ↻, ✏️, and
friends. `aria-label` is **required**: the icon is the only visual, so the
label is the accessible name.

<div class="silo-demo">
  <button class="silo-icon-button" aria-label="Close"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button>
  <button class="silo-icon-button" aria-label="Refresh"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M13 4.5A5.5 5.5 0 1 0 14 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M13 2v3h-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
  <button class="silo-icon-button" aria-label="More options"><svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="3" r="1.3" fill="currentColor"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/><circle cx="8" cy="13" r="1.3" fill="currentColor"/></svg></button>
  <span style="width:14px"></span>
  <button class="silo-icon-button silo-icon-button-sm" aria-label="Close (small)"><svg width="13" height="13" viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button>
  <button class="silo-icon-button silo-icon-button-sm" aria-label="More options (small)"><svg width="14" height="14" viewBox="0 0 16 16"><circle cx="8" cy="3" r="1.3" fill="currentColor"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/><circle cx="8" cy="13" r="1.3" fill="currentColor"/></svg></button>
</div>

```tsx
import { IconButton } from "@silo-code/sdk";

<IconButton aria-label="Refresh" onClick={refresh}>
  <RefreshIcon size="1em" />
</IconButton>

// compact — e.g. in a ListRow's trailing slot (one common home, not the only one)
<ListRow
  trailing={
    <>
      <IconButton size="sm" aria-label="Pin" onClick={pin}>
        <PinIcon size="1em" />
      </IconButton>
      <IconButton size="sm" aria-label="More options" onClick={menu}>
        <MoreIcon size="1em" />
      </IconButton>
    </>
  }
>
  Agent Monitor
</ListRow>

// panel / breadcrumb toolbar (local-web-viewer tone)
<IconButton size="sm" variant="toolbar" aria-label="Back">
  <ArrowLeft size="1em" weight="bold" />
</IconButton>
```

| Prop         | Type                    | Default    | Notes                                                               |
| ------------ | ----------------------- | ---------- | ------------------------------------------------------------------- |
| `size`       | `"normal" \| "sm"`      | `"normal"` | `2.5em` / `2em` of `--silo-font-size-base` (Zoom In/Out)            |
| `variant`    | `"normal" \| "toolbar"` | `"normal"` | `toolbar` — B/W toolbar-text icons, hover fill only, no press-scale |
| `aria-label` | `string`                | —          | required                                                            |
| …rest        | button props            |            |                                                                     |

States (`normal`): transparent at rest (icon at `--silo-color-text-lo`),
`bg-hover` fill + brighter icon on hover, `bg-active` fill + scale-down when
pressed. `toolbar` keeps toolbar-text on hover and uses an accent wash when
`aria-pressed` / `data-checked` is set.

::: tip Multiple actions in one row
A `ListRow`'s `trailing` slot takes several `IconButton size="sm"` side by
side — don't wrap them in extra layout.
:::

::: tip Pair it with a Tooltip
`aria-label` gives screen readers the name; sighted users get nothing from it.
Wrap the button in [`Tooltip`](/design/components/feedback#tooltip) so everyone gets the label:
`<Tooltip content="Refresh"><IconButton aria-label="Refresh">…</IconButton></Tooltip>`.
:::

## MenuButton

A **labelled** button that opens a menu — the counterpart to `IconButton` for
cases where a bare `⋮` doesn't tell anyone what they'd get. Renders its label
with a trailing chevron, the standard signal that pressing it reveals more
rather than performing something.

<div class="silo-demo">
  <button class="silo-menu-button">
    <span class="silo-menu-button-label">More</span>
    <svg class="silo-menu-button-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </button>
  <button class="silo-menu-button silo-menu-button-sm">
    <span class="silo-menu-button-label">Sort</span>
    <svg class="silo-menu-button-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </button>
</div>

```tsx
import { MenuButton } from "@silo-code/sdk";

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
/>;
```

| Prop     | Type               | Default    | Notes                                        |
| -------- | ------------------ | ---------- | -------------------------------------------- |
| `label`  | `ReactNode`        | —          | required — the whole point over `IconButton` |
| `size`   | `"normal" \| "sm"` | `"normal"` | `sm` for card footers and list rows          |
| children | `ReactNode`        | —          | optional leading content, e.g. an icon       |
| …rest    | button props       |            | `aria-haspopup="menu"` is applied for you    |

Quieter than `Button` on purpose: no border and no fill at rest, `bg-hover` on
hover. It reveals rather than commits, so it shouldn't compete with the real
action beside it.

::: tip MenuButton or a `⋮` IconButton?
Both open a menu; they differ in **who is expected to find it**. Reach for
`MenuButton` when the menu is somewhere a user is _meant_ to go — a bare `⋮` is
discoverable only by people who already know to look, so anything a first-time
user needs belongs behind a labelled trigger. Keep `IconButton` for dense rows
and toolbars where a label genuinely won't fit and the actions are secondary.
:::

Neither owns the menu. Open one from `onClick` with
[`ctx.ui.showMenu`](/api/types/interfaces/UiService#showmenu), anchoring
`at: e.currentTarget` so it lines up under the trigger.
