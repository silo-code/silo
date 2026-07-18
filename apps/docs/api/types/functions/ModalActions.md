# Function: ModalActions()

```ts
function ModalActions(__namedParameters): Element;
```

Defined in: packages/sdk/src/ModalActions.tsx:34

The right-aligned footer row for a modal's action buttons — a thin
`.silo-modal-actions` wrapper so every modal's footer lines up without each
caller re-specifying the flex row. Optional `start` slot pins meta text or
a secondary action on the left.

Styled purely via host-provided `.silo-modal-actions*` classes — no
stylesheet import is needed in the extension.

## Parameters

### \_\_namedParameters

#### start?

`ReactNode`

Optional left-pinned slot for meta text or a secondary action.

#### children?

`ReactNode`

## Returns

`Element`

## Example

```tsx
<ModalActions>
  <Button onClick={close}>Cancel</Button>
  <Button variant="primary" onClick={save}>Create</Button>
</ModalActions>

<ModalActions start="6 sessions · 6 procs">
  <Button>Go to Terminal</Button>
  <Button variant="danger">End Task</Button>
</ModalActions>

<ModalActions
  start={<Button size="sm" onClick={create}>+ Create branch</Button>}
>
  <Button onClick={fetch}>Fetch</Button>
</ModalActions>
```
