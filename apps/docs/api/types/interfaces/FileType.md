# Interface: FileType

Defined in: [packages/sdk/src/types.ts:174](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L174)

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

Defined in: [packages/sdk/src/types.ts:176](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L176)

Unique id, conventionally namespaced.

***

### label

```ts
label: string;
```

Defined in: [packages/sdk/src/types.ts:178](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L178)

Human label, e.g. "Foo File". Used to build "New {label}…" entries.

***

### extensions

```ts
extensions: string[];
```

Defined in: [packages/sdk/src/types.ts:180](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L180)

Extensions this type owns — leading dot, lowercase. e.g. [".foo"].

***

### newFile?

```ts
optional newFile?: NewFileTemplate;
```

Defined in: [packages/sdk/src/types.ts:182](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L182)

When present, the type can be created from "New File" surfaces.
