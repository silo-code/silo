# Function: RadioCard()

```ts
function RadioCard(__namedParameters): Element;
```

Defined in: [packages/sdk/src/RadioGroup.tsx:68](https://github.com/silo-code/silo/blob/main/packages/sdk/src/RadioGroup.tsx#L68)

One option inside a [RadioGroup](RadioGroup.md). The whole card is the click target.

## Parameters

### \_\_namedParameters

#### value

`string`

#### title

`string`

#### description?

`string`

## Returns

`Element`

## Example

```tsx
<RadioCard
  value="clear"
  title="Clear the finished indicator"
  description="Viewing the terminal acknowledges the run."
/>
```
