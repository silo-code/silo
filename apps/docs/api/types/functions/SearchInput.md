# Function: SearchInput()

```ts
function SearchInput(__namedParameters): ReactNode;
```

Defined in: [packages/sdk/src/SearchInput.tsx:58](https://github.com/silo-code/silo/blob/main/packages/sdk/src/SearchInput.tsx#L58)

The filter-as-you-type field: leading search icon, and a clear ✕ that
appears once there's a value (and stays a real tab stop). Pair with
[List](List.md) for the standard picker pattern.

Styled purely via host-provided `.silo-search-input*` classes — no
stylesheet import is needed in the extension.

## Parameters

### \_\_namedParameters

#### value

`string`

#### onValueChange

(`value`) => `void`

#### placeholder?

`string`

#### autoFocus?

`boolean`

#### onClear?

() => `void`

Extra hook when ✕ clears the field.

## Returns

`ReactNode`

## Example

```tsx
<SearchInput
  value={query}
  onValueChange={setQuery}
  placeholder="Filter branches…"
/>
```
