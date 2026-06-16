# Interface: FileType

Defined in: [packages/sdk/src/types.ts:156](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L156)

Declarative metadata about a file extension — the open-ended counterpart to
Viewer (which is purely a renderer). A single source of truth that "New File"
surfaces (and, later, tab/explorer icons) can enumerate. Registering a
FileType does not register a viewer; the two are matched independently by
extension at dispatch time.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:158](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L158)

Unique id, conventionally namespaced.

***

### label

```ts
label: string;
```

Defined in: [packages/sdk/src/types.ts:160](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L160)

Human label, e.g. "Foo File". Used to build "New {label}…" entries.

***

### extensions

```ts
extensions: string[];
```

Defined in: [packages/sdk/src/types.ts:162](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L162)

Extensions this type owns — leading dot, lowercase. e.g. [".foo"].

***

### newFile?

```ts
optional newFile?: NewFileTemplate;
```

Defined in: [packages/sdk/src/types.ts:164](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L164)

When present, the type can be created from "New File" surfaces.
