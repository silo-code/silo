# Function: Select()

```ts
function Select(__namedParameters): Element;
```

Defined in: packages/sdk/src/Select.tsx:21

A native `<select>` wearing the [Input](../variables/Input.md) treatment — keep it for short
enumerable values ("Block / Bar / Underline").

Styled purely via the host-provided `.silo-select` class — no stylesheet
import is needed in the extension.

## Parameters

### \_\_namedParameters

`object` & `Omit`\<`SelectHTMLAttributes`\<`HTMLSelectElement`\>, `"children"`\>

## Returns

`Element`

## Example

```tsx
<Select value={cursorStyle} onChange={(e) => setCursorStyle(e.target.value)}>
  <option value="block">Block</option>
  <option value="bar">Bar</option>
</Select>
```
