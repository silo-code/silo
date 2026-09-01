# Interface: EditorRecord

Defined in: [packages/sdk/src/domain-types.ts:95](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L95)

An editor tab record in a workspace — a text editor or a diff.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/domain-types.ts:96](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L96)

***

### filePath

```ts
filePath: string | null;
```

Defined in: [packages/sdk/src/domain-types.ts:98](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L98)

null for an untitled buffer that hasn't been saved yet.

***

### title

```ts
title: string;
```

Defined in: [packages/sdk/src/domain-types.ts:99](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L99)

***

### isPreview?

```ts
optional isPreview?: boolean;
```

Defined in: [packages/sdk/src/domain-types.ts:101](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L101)

When true, the tab is a temporary preview that gets replaced by the next single-click open.

***

### mode?

```ts
optional mode?: EditorMode;
```

Defined in: [packages/sdk/src/domain-types.ts:107](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L107)

Which mode this record renders in. Absent ⇒ `"text"`. A `"diff"` record
additionally carries [EditorRecord.providerId](#providerid)/[EditorRecord.args](#args)
and always has a non-null `filePath`.

***

### providerId?

```ts
optional providerId?: string;
```

Defined in: [packages/sdk/src/domain-types.ts:113](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L113)

Diff mode only: which registered diff-content provider resolves the two
sides (e.g. "silo.git"). The diff is content-agnostic — the provider owns
what the two sides contain.

***

### args?

```ts
optional args?: Record<string, unknown>;
```

Defined in: [packages/sdk/src/domain-types.ts:118](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L118)

Diff mode only: serializable args the provider needs to (re)compute content
on mount / restart.

***

### viewType?

```ts
optional viewType?: string;
```

Defined in: [packages/sdk/src/domain-types.ts:129](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L129)

The chosen editor *view* for this tab, referencing an [Editor.id](Editor.md#id)
(e.g. `"text"`, `"silo.markdown-preview"`). Absent ⇒ the host renders the
highest-priority matching editor (the default). Honored only when the
referenced editor is still registered **and** still matches the file;
otherwise the host falls back to priority resolution (so a stale value left
by an uninstalled extension never breaks the tab). Orthogonal to
[EditorRecord.mode](#mode): `viewType` selects among `"text"`-mode editors; a
`"diff"` record ignores it.
