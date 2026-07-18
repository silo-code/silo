# Function: EmptyState()

```ts
function EmptyState(__namedParameters): Element;
```

Defined in: [packages/sdk/src/EmptyState.tsx:36](https://github.com/silo-code/silo/blob/main/packages/sdk/src/EmptyState.tsx#L36)

The big-icon + title + dim-description block a modal shows when a list is
empty or everything is fine ("All workflows passing"). Renders flat in the
modal body — no card, no shadow of its own.

Styled purely via host-provided `.silo-empty-state*` classes — no
stylesheet import is needed in the extension.

## Parameters

### \_\_namedParameters

#### tone?

`EmptyStateTone` = `"neutral"`

Colors the circled icon; `ok` = green ring for positive-empty.

#### icon?

`ReactNode`

#### title

`string`

#### description?

`string`

#### action?

`ReactNode`

e.g. a `Button` ("Clear filter").

## Returns

`Element`

## Example

```tsx
<EmptyState
  tone="ok"
  icon={<CheckIcon />}
  title="All workflows passing"
  description="No failures or active runs on this repo."
/>

<EmptyState
  icon={<SearchIcon />}
  title="No matching branches"
  description="Try a different filter."
/>
```
