# Interface: NewFileTemplate

Defined in: [packages/sdk/src/types.ts:212](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L212)

Describes how to bootstrap a new, never-saved buffer for a file type. Its
mere presence on a FileType marks the type as creatable — it shows up in the
"New File" surfaces (the tab-group + menu, the empty-workspace watermark).

## Properties

### defaultName?

```ts
optional defaultName?: string;
```

Defined in: [packages/sdk/src/types.ts:214](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L214)

Base name (no extension) for the untitled buffer. Defaults to "Untitled".
