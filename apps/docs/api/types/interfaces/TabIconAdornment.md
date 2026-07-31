# Interface: TabIconAdornment

Defined in: [packages/sdk/src/tab-adornment.ts:23](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L23)

Leading identity adornment on a CenterDock tab — arbitrary React artwork
(e.g. an app logo). Set via [EditorService.setIcon](EditorService.md#seticon) /
[TerminalService.setIcon](TerminalService.md#seticon).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/tab-adornment.ts:25](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L25)

Extension-owned key; stacking + [EditorService.clearIcon](EditorService.md#clearicon) target.

***

### icon

```ts
icon: ReactNode;
```

Defined in: [packages/sdk/src/tab-adornment.ts:27](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L27)

Leading glyph / logo rendered before the tab title.
