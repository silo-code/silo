# Variable: Input

```ts
const Input: ForwardRefExoticComponent<object & InputHTMLAttributes<HTMLInputElement> & RefAttributes<HTMLInputElement>>;
```

Defined in: [packages/sdk/src/Input.tsx:24](https://github.com/silo-code/silo/blob/main/packages/sdk/src/Input.tsx#L24)

The single text-input treatment used across modal content: input-bg,
6×8px padding, small radius, the shared focus ring.

Styled purely via host-provided `.silo-input*` classes — no stylesheet
import is needed in the extension.

## Example

```tsx
<Input
  value={name}
  onChange={(e) => setName(e.target.value)}
  placeholder="Workspace name"
/>
<Input block />
```
