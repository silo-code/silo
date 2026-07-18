# Function: InlineEdit()

```ts
function InlineEdit(__namedParameters): ReactNode;
```

Defined in: [packages/sdk/src/InlineEdit.tsx:114](https://github.com/silo-code/silo/blob/main/packages/sdk/src/InlineEdit.tsx#L114)

Click-to-edit a value in place — a static display with a pencil affordance
that swaps to a field with explicit ✓ Save / ✗ Cancel buttons. Use it for
values where committing an empty/invalid value would be visibly broken
elsewhere; everything else in a modal should save as you type instead.

**Escape is two-stage**: the first Esc cancels the edit; the next Esc
closes the modal. The host coordinates this via the SDK's
`setActiveInlineEditCancel` hook — do not add your own Escape handler.

Styled purely via host-provided `.silo-inline-edit*` classes — no
stylesheet import is needed in the extension.

## Parameters

### \_\_namedParameters

#### value

`string`

The committed value.

#### onSave

(`value`) => `void`

Called with the trimmed, validated value; not called if unchanged.

#### validate?

(`v`) => [`InlineEditValidation`](../type-aliases/InlineEditValidation.md)

Optional — failure shows the error inline and blocks the save.

#### multiline?

`boolean` = `false`

Textarea-based editing.

#### aria-label

`string`

## Returns

`ReactNode`

## Example

```tsx
<InlineEdit
  value={ws.name}
  onSave={(name) => ctx.workspaces.rename(ws.id, name)}
  validate={validateWorkspaceName}
  aria-label="Rename workspace"
/>

<InlineEdit
  multiline
  value={description}
  onSave={setDescription}
  aria-label="Edit description"
/>
```
