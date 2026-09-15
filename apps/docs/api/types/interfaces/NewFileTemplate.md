# Interface: NewFileTemplate

Defined in: [packages/sdk/src/types.ts:297](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L297)

Describes how to bootstrap a new, never-saved buffer for a file type. Its
mere presence on a FileType marks the type as creatable — it shows up in the
"New File" surfaces (the tab-group + menu, the empty-workspace watermark).

## Properties

### defaultName?

```ts
optional defaultName?: string;
```

Defined in: [packages/sdk/src/types.ts:299](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L299)

Base name (no extension) for the untitled buffer. Defaults to "Untitled".
