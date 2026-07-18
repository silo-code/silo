# Type Alias: InlineEditValidation

```ts
type InlineEditValidation = 
  | {
  ok: true;
  value: string;
}
  | {
  ok: false;
  error: string;
};
```

Defined in: packages/sdk/src/InlineEdit.tsx:25

Result of an [InlineEdit](../functions/InlineEdit.md) `validate` callback.
