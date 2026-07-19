# Interface: ListRowProps

Defined in: [packages/sdk/src/List.tsx:125](https://github.com/silo-code/silo/blob/main/packages/sdk/src/List.tsx#L125)

One row inside a [List](../functions/List.md). Stretches full-width; long text truncates
(use `truncate="start"` for paths). `trailing` content never shrinks.

## Example

```tsx
<ListRow
  selected={folder.primary}
  leading={<FolderIcon />}
  trailing={<Badge tone="accent">primary</Badge>}
  truncate="start"
  onSelect={() => choose(folder)}
>
  {folder.path}
</ListRow>
```

## Properties

### selected?

```ts
optional selected?: boolean;
```

Defined in: [packages/sdk/src/List.tsx:126](https://github.com/silo-code/silo/blob/main/packages/sdk/src/List.tsx#L126)

***

### leading?

```ts
optional leading?: ReactNode;
```

Defined in: [packages/sdk/src/List.tsx:128](https://github.com/silo-code/silo/blob/main/packages/sdk/src/List.tsx#L128)

Icon slot (dimmed, fixed).

***

### trailing?

```ts
optional trailing?: ReactNode;
```

Defined in: [packages/sdk/src/List.tsx:130](https://github.com/silo-code/silo/blob/main/packages/sdk/src/List.tsx#L130)

Badge(s) and/or `IconButton size="sm"`(s).

***

### truncate?

```ts
optional truncate?: ListRowTruncate;
```

Defined in: [packages/sdk/src/List.tsx:132](https://github.com/silo-code/silo/blob/main/packages/sdk/src/List.tsx#L132)

Default `"end"`. Use `"start"` for paths.

***

### onSelect?

```ts
optional onSelect?: () => void;
```

Defined in: [packages/sdk/src/List.tsx:134](https://github.com/silo-code/silo/blob/main/packages/sdk/src/List.tsx#L134)

Click / Space select.

#### Returns

`void`

***

### onActivate?

```ts
optional onActivate?: () => void;
```

Defined in: [packages/sdk/src/List.tsx:136](https://github.com/silo-code/silo/blob/main/packages/sdk/src/List.tsx#L136)

Enter / double-click.

#### Returns

`void`

***

### children?

```ts
optional children?: ReactNode;
```

Defined in: [packages/sdk/src/List.tsx:137](https://github.com/silo-code/silo/blob/main/packages/sdk/src/List.tsx#L137)
