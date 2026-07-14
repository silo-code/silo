# Function: Tooltip()

```ts
function Tooltip(__namedParameters): Element;
```

Defined in: [packages/sdk/src/Tooltip.tsx:35](https://github.com/silo-code/silo/blob/main/packages/sdk/src/Tooltip.tsx#L35)

Lightweight tooltip — wraps any trigger element and shows a styled popup
above it after a 600 ms hover delay. Renders via a portal so `overflow:
hidden` parents and stacking contexts never clip it.

The popup uses the host's design tokens and matches the status-bar tooltip
style exactly. Display-only: `pointer-events: none`.

The CSS classes (`.silo-tooltip`, `.silo-tooltip-host`) are provided by the
host — no stylesheet import is needed in the extension.

Pass `disabled` to keep the trigger wrapper mounted (so layout stays stable)
while suppressing the popup — handy when the tooltip is only useful
conditionally, e.g. showing the full label of a tab only once it's truncated.

## Parameters

### \_\_namedParameters

#### content

`string`

Text shown in the popup.

#### children

`ReactNode`

The trigger element the tooltip is anchored to.

#### disabled?

`boolean` = `false`

When `true`, the wrapper still renders (layout is unchanged) but the popup
never appears. Defaults to `false`.

## Returns

`Element`

## Example

```tsx
<Tooltip content="New File">
  <button onClick={createFile}>
    <FilePlus size="1.2em" />
  </button>
</Tooltip>
```
