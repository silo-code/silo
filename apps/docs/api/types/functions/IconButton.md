# Function: IconButton()

```ts
function IconButton(__namedParameters): Element;
```

Defined in: [packages/sdk/src/IconButton.tsx:30](https://github.com/silo-code/silo/blob/main/packages/sdk/src/IconButton.tsx#L30)

A square icon-only button — the kit's one answer for ✕, ⋮, ↻, ✏️, and
friends. `aria-label` is **required**: the icon is the only visual, so the
label is the accessible name. Pair with [Tooltip](Tooltip.md) so sighted users
get the same label on hover.

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
  <RefreshIcon />
</IconButton>

// compact — e.g. in a ListRow's trailing slot
<IconButton size="sm" aria-label="Pin" onClick={pin}>
  <PinIcon />
</IconButton>
```
