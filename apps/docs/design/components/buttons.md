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

<IconButton aria-label="Refresh" onClick={refresh}><RefreshIcon /></IconButton>

// compact — e.g. in a ListRow's trailing slot (one common home, not the only one)
<ListRow
  trailing={
    <>
      <IconButton size="sm" aria-label="Pin" onClick={pin}><PinIcon /></IconButton>
      <IconButton size="sm" aria-label="More options" onClick={menu}><MoreIcon /></IconButton>
    </>
  }
>
  Agent Monitor
</ListRow>
```

| Prop         | Type               | Default    | Notes                                               |
| ------------ | ------------------ | ---------- | --------------------------------------------------- |
| `size`       | `"normal" \| "sm"` | `"normal"` | 32px standalone / 26px for tight or inline contexts |
| `aria-label` | `string`           | —          | required                                            |
| …rest        | button props       |            |                                                     |

States: transparent at rest (icon at `--silo-color-text-lo`), `bg-hover` fill +
brighter icon on hover, `bg-active` fill + scale-down when pressed.

::: tip Multiple actions in one row
A `ListRow`'s `trailing` slot takes several `IconButton size="sm"` side by
side — don't wrap them in extra layout.
:::

::: tip Pair it with a Tooltip
`aria-label` gives screen readers the name; sighted users get nothing from it.
Wrap the button in [`Tooltip`](/design/components/feedback#tooltip) so everyone gets the label:
`<Tooltip content="Refresh"><IconButton aria-label="Refresh">…</IconButton></Tooltip>`.
:::
