# Interface: FileType

Defined in: [packages/sdk/src/types.ts:311](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L311)

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

Defined in: [packages/sdk/src/types.ts:313](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L313)

Unique id, conventionally namespaced.

***

### label

```ts
label: string;
```

Defined in: [packages/sdk/src/types.ts:315](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L315)

Human label, e.g. "Foo File". Used to build "New {label}…" entries.

***

### extensions

```ts
extensions: string[];
```

Defined in: [packages/sdk/src/types.ts:317](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L317)

Extensions this type owns — leading dot, lowercase. e.g. [".foo"].

***

### newFile?

```ts
optional newFile?: NewFileTemplate;
```

Defined in: [packages/sdk/src/types.ts:319](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L319)

When present, the type can be created from "New File" surfaces.
