# Interface: EditorRecord

Defined in: [packages/sdk/src/domain-types.ts:70](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L70)

An editor tab record in a workspace — a text editor or a diff.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/domain-types.ts:71](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L71)

***

### filePath

```ts
filePath: string | null;
```

Defined in: [packages/sdk/src/domain-types.ts:73](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L73)

null for an untitled buffer that hasn't been saved yet.

***

### title

```ts
title: string;
```

Defined in: [packages/sdk/src/domain-types.ts:74](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L74)

***

### isPreview?

```ts
optional isPreview?: boolean;
```

Defined in: [packages/sdk/src/domain-types.ts:76](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L76)

When true, the tab is a temporary preview that gets replaced by the next single-click open.

***

### mode?

```ts
optional mode?: EditorMode;
```

Defined in: [packages/sdk/src/domain-types.ts:82](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L82)

Which mode this record renders in. Absent ⇒ `"text"`. A `"diff"` record
additionally carries [EditorRecord.providerId](#providerid)/[EditorRecord.args](#args)
and always has a non-null `filePath`.

***

### providerId?

```ts
optional providerId?: string;
```

Defined in: [packages/sdk/src/domain-types.ts:88](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L88)

Diff mode only: which registered diff-content provider resolves the two
sides (e.g. "silo.git"). The diff is content-agnostic — the provider owns
what the two sides contain.

***

### args?

```ts
optional args?: Record<string, unknown>;
```

Defined in: [packages/sdk/src/domain-types.ts:93](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L93)

Diff mode only: serializable args the provider needs to (re)compute content
on mount / restart.

***

### viewType?

```ts
optional viewType?: string;
```

Defined in: [packages/sdk/src/domain-types.ts:104](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L104)

The chosen editor *view* for this tab, referencing an [Editor.id](Editor.md#id)
(e.g. `"text"`, `"silo.markdown-preview"`). Absent ⇒ the host renders the
highest-priority matching editor (the default). Honored only when the
referenced editor is still registered **and** still matches the file;
otherwise the host falls back to priority resolution (so a stale value left
by an uninstalled extension never breaks the tab). Orthogonal to
[EditorRecord.mode](#mode): `viewType` selects among `"text"`-mode editors; a
`"diff"` record ignores it.
