# Variable: Textarea

```ts
const Textarea: ForwardRefExoticComponent<TextareaHTMLAttributes<HTMLTextAreaElement> & RefAttributes<HTMLTextAreaElement>>;
```

Defined in: [packages/sdk/src/Textarea.tsx:22](https://github.com/silo-code/silo/blob/main/packages/sdk/src/Textarea.tsx#L22)

Multi-line text entry wearing the same tokens as [Input](Input.md), plus
comfortable line-height, vertical resize, and a 64px minimum height.

Styled purely via the host-provided `.silo-textarea` class — no
stylesheet import is needed in the extension.

## Example

```tsx
<Textarea
  value={notes}
  onChange={(e) => setNotes(e.target.value)}
  placeholder="Notes…"
/>
```
