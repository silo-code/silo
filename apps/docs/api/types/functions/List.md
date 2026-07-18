# Function: List()

```ts
function List(__namedParameters): Element;
```

Defined in: [packages/sdk/src/List.tsx:60](https://github.com/silo-code/silo/blob/main/packages/sdk/src/List.tsx#L60)

A full-width listbox of selectable rows. One tab stop; ↑/↓ move the focus
ring, Space/Enter select. Pair with [ListRow](ListRow.md) children.

Styled purely via the host-provided `.silo-list` class — no stylesheet
import is needed in the extension.

## Parameters

### \_\_namedParameters

#### aria-label

`string`

Required — it's a listbox.

#### onActivate?

(`index`) => `void`

Enter / double-click on a row.

#### children?

`ReactNode`

## Returns

`Element`

## Example

```tsx
<List aria-label="Workspace folders">
  <ListRow
    selected={folder.primary}
    leading={<FolderIcon />}
    trailing={<Badge tone="accent">primary</Badge>}
    onSelect={() => choose(folder)}
  >
    {folder.path}
  </ListRow>
</List>
```
