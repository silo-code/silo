# Function: Switch()

```ts
function Switch(__namedParameters): Element;
```

Defined in: [packages/sdk/src/Switch.tsx:25](https://github.com/silo-code/silo/blob/main/packages/sdk/src/Switch.tsx#L25)

The iOS-style on/off toggle used throughout settings. Off = recessed
`bg-active` track with a hairline border; on = accent fill. Focus uses a
positive-offset ring (the one deliberate exception to the shared inset
ring — an 18px pill can't take an inset outline).

Styled purely via the host-provided `.silo-switch-track` class — no
stylesheet import is needed in the extension.

## Parameters

### \_\_namedParameters

`object` & `Omit`\<`ButtonHTMLAttributes`\<`HTMLButtonElement`\>, `"children"` \| `"role"` \| `"aria-checked"` \| `"aria-label"` \| `"onChange"`\>

## Returns

`Element`

## Example

```tsx
<Switch
  checked={formatOnSave}
  onChange={setFormatOnSave}
  aria-label="Format on save"
/>
```
