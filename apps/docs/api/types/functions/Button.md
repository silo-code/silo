# Function: Button()

```ts
function Button(__namedParameters): Element;
```

Defined in: packages/sdk/src/Button.tsx:28

The action button in three variants. In a modal footer the primary action
sits rightmost with neutral actions to its left (see [ModalActions](ModalActions.md)).

Styled purely via host-provided `.silo-button*` classes — no stylesheet
import is needed in the extension.

## Parameters

### \_\_namedParameters

`object` & `Omit`\<`ButtonHTMLAttributes`\<`HTMLButtonElement`\>, `"children"`\>

## Returns

`Element`

## Example

```tsx
<Button onClick={cancel}>Cancel</Button>
<Button variant="primary" onClick={save}>Save</Button>
<Button variant="danger" onClick={remove}>Delete</Button>
<Button size="sm">Compact</Button>
```
