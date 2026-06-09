# Interface: FileType

Defined in: [packages/sdk/src/types.ts:155](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L155)

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

Defined in: [packages/sdk/src/types.ts:157](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L157)

Unique id, conventionally namespaced.

***

### label

```ts
label: string;
```

Defined in: [packages/sdk/src/types.ts:159](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L159)

Human label, e.g. "Foo File". Used to build "New {label}…" entries.

***

### extensions

```ts
extensions: string[];
```

Defined in: [packages/sdk/src/types.ts:161](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L161)

Extensions this type owns — leading dot, lowercase. e.g. [".foo"].

***

### newFile?

```ts
optional newFile?: NewFileTemplate;
```

Defined in: [packages/sdk/src/types.ts:163](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L163)

When present, the type can be created from "New File" surfaces.
