# Function: Tooltip()

```ts
function Tooltip(__namedParameters): Element;
```

Defined in: packages/sdk/src/Tooltip.tsx:31

Lightweight tooltip — wraps any trigger element and shows a styled popup
above it after a 600 ms hover delay. Renders via a portal so `overflow:
hidden` parents and stacking contexts never clip it.

The popup uses the host's design tokens and matches the status-bar tooltip
style exactly. Display-only: `pointer-events: none`.

The CSS classes (`.silo-tooltip`, `.silo-tooltip-host`) are provided by the
host — no stylesheet import is needed in the extension.

## Parameters

### \_\_namedParameters

#### content

`string`

#### children

`ReactNode`

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
