# Function: AddRow()

```ts
function AddRow(__namedParameters): Element;
```

Defined in: [packages/sdk/src/AddRow.tsx:38](https://github.com/silo-code/silo/blob/main/packages/sdk/src/AddRow.tsx#L38)

The ghost "＋ Add…" action that sits flush under a [List](List.md) — visually
a row, semantically a button. No fill at rest; `bg-hover` on hover.

Styled purely via host-provided `.silo-add-row*` classes — no stylesheet
import is needed in the extension.

## Parameters

### \_\_namedParameters

`object` & `Omit`\<`ButtonHTMLAttributes`\<`HTMLButtonElement`\>, `"children"`\>

## Returns

`Element`

## Example

```tsx
<List aria-label="Folders">…</List>
<AddRow onClick={addFolder}>Add Folder…</AddRow>
```
