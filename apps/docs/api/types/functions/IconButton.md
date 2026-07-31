# Function: IconButton()

```ts
function IconButton(__namedParameters): Element;
```

Defined in: [packages/sdk/src/IconButton.tsx:43](https://github.com/silo-code/silo/blob/main/packages/sdk/src/IconButton.tsx#L43)

A square icon-only button — the kit's one answer for ✕, ⋮, ↻, ✏️, and
friends. `aria-label` is **required**: the icon is the only visual, so the
label is the accessible name. Pair with [Tooltip](Tooltip.md) so sighted users
get the same label on hover.

Sized in terms of `--silo-font-size-base` so the hit target and child SVGs
scale with Silo's UI zoom (`uiFontSize`). Prefer Phosphor `size="1em"`
(or omit a fixed px size) so the glyph tracks the button.

Styled purely via host-provided `.silo-icon-button*` classes — no
stylesheet import is needed in the extension.

## Parameters

### \_\_namedParameters

`object` & `Omit`\<`ButtonHTMLAttributes`\<`HTMLButtonElement`\>, `"children"` \| `"aria-label"`\>

## Returns

`Element`

## Example

```tsx
<IconButton aria-label="Refresh" onClick={refresh}>
  <RefreshIcon size="1em" />
</IconButton>

// compact — e.g. in a ListRow's trailing slot
<IconButton size="sm" aria-label="Pin" onClick={pin}>
  <PinIcon size="1em" />
</IconButton>

// panel / breadcrumb toolbar (local-web-viewer tone)
<IconButton size="sm" variant="toolbar" aria-label="Mark">
  <FlagIcon size="1em" weight="bold" />
</IconButton>
```
