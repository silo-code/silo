# Type Alias: DndMode

```ts
type DndMode = "copy" | "paste";
```

Defined in: [packages/sdk/src/dnd-service.ts:68](https://github.com/silo-code/silo/blob/main/packages/sdk/src/dnd-service.ts#L68)

The interaction mode resolved from held modifiers at hover/drop time:
`"copy"` is the default (e.g. open / split); `"paste"` is Shift-held (e.g.
insert path at caret / paste into the terminal). Resolved robustly even when
WebKit suppresses key events mid-drag.
