# Function: RadioGroup()

```ts
function RadioGroup(__namedParameters): Element;
```

Defined in: [packages/sdk/src/RadioGroup.tsx:37](https://github.com/silo-code/silo/blob/main/packages/sdk/src/RadioGroup.tsx#L37)

Stacked option cards — each a full-width click target with a radio dot, a
bold title, and a dim description. Wrap [RadioCard](RadioCard.md) children; the
selected card gets an accent border and a faint accent tint. Native tab
stops per card — no arrow-key roving.

Styled purely via host-provided `.silo-radio-card*` classes — no
stylesheet import is needed in the extension.

## Parameters

### \_\_namedParameters

#### value

`string`

#### onChange

(`value`) => `void`

#### children?

`ReactNode`

## Returns

`Element`

## Example

```tsx
<RadioGroup value={mode} onChange={setMode}>
  <RadioCard
    value="clear"
    title="Clear the finished indicator"
    description="Viewing the terminal acknowledges the run — the green check disappears."
  />
  <RadioCard
    value="keep"
    title="Keep it until the next run"
    description="Viewing changes nothing."
  />
</RadioGroup>
```
