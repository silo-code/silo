# Interface: FileType

Defined in: [packages/sdk/src/types.ts:229](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L229)

Declarative metadata about a file extension — the open-ended counterpart to
[Editor](Editor.md) (which is purely a presenter/renderer). A single source of
truth that "New File" surfaces (and, later, tab/explorer icons) can
enumerate. Registering a FileType does not register an Editor; the two are
matched independently by extension at dispatch time.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:231](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L231)

Unique id, conventionally namespaced.

***

### label

```ts
label: string;
```

Defined in: [packages/sdk/src/types.ts:233](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L233)

Human label, e.g. "Foo File". Used to build "New {label}…" entries.

***

### extensions

```ts
extensions: string[];
```

Defined in: [packages/sdk/src/types.ts:235](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L235)

Extensions this type owns — leading dot, lowercase. e.g. [".foo"].

***

### newFile?

```ts
optional newFile?: NewFileTemplate;
```

Defined in: [packages/sdk/src/types.ts:237](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L237)

When present, the type can be created from "New File" surfaces.
