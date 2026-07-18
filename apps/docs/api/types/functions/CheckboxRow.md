# Function: CheckboxRow()

```ts
function CheckboxRow(__namedParameters): Element;
```

Defined in: packages/sdk/src/CheckboxRow.tsx:22

A labeled checkbox row (15px box, accent check). The whole label is the
click target.

Styled purely via the host-provided `.silo-checkbox-row` class — no
stylesheet import is needed in the extension.

## Parameters

### \_\_namedParameters

`object` & `Omit`\<`InputHTMLAttributes`\<`HTMLInputElement`\>, `"children"` \| `"disabled"` \| `"type"` \| `"onChange"` \| `"checked"`\>

## Returns

`Element`

## Example

```tsx
<CheckboxRow
  label="Only monitor the checked-out branch"
  checked={onlyCheckedOut}
  onChange={setOnlyCheckedOut}
/>
```
