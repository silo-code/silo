# Function: SettingRow()

```ts
function SettingRow(__namedParameters): Element;
```

Defined in: [packages/sdk/src/SettingRow.tsx:28](https://github.com/silo-code/silo/blob/main/packages/sdk/src/SettingRow.tsx#L28)

The label + hint + control row every settings surface uses: title and dim
description on the left, the control pinned right. Rows in a group are
separated by hairline dividers.

Styled purely via host-provided `.silo-setting-row*` classes — no
stylesheet import is needed in the extension.

## Parameters

### \_\_namedParameters

#### label

`string`

#### hint?

`string`

#### children?

`ReactNode`

The control — `Switch`, `Select`, `Input`, etc.

## Returns

`Element`

## Example

```tsx
<SettingRow
  label="Format on save"
  hint="Run Format Document before writing to disk."
>
  <Switch
    checked={formatOnSave}
    onChange={setFormatOnSave}
    aria-label="Format on save"
  />
</SettingRow>
```
