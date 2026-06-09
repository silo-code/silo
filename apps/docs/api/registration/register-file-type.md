# ctx.registerFileType

Declare a file type the app knows about (label + owned extensions), and optionally make it creatable from the "New File" surfaces. Independent of viewers: a file type describes the format, a viewer renders it.

```ts
ctx.registerFileType(type: FileType): Disposable
```

## Example

```tsx
ctx.registerFileType({
  id: "acme.foo",
  label: "Foo File",
  extensions: [".foo"],
  newFile: { defaultName: "Untitled" },
});
```

## Types

Pass [`FileType`](/api/types/interfaces/FileType).

Related: [`NewFileTemplate`](/api/types/interfaces/NewFileTemplate).

## See also

Other [Registration](/api/#registration) members on `ctx`.
