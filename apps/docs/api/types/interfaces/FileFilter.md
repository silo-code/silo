# Interface: FileFilter

Defined in: [packages/sdk/src/ui-service.ts:15](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L15)

A file-type filter for the native open/save dialogs ([UiService.pickFile](UiService.md#pickfile),
[UiService.savePath](UiService.md#savepath)) — a human-readable group plus the extensions it
matches. Mirrors the OS dialog's file-type dropdown.

## Properties

### name

```ts
name: string;
```

Defined in: [packages/sdk/src/ui-service.ts:17](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L17)

Human-readable label for the group, e.g. `"JSON"` or `"Images"`.

***

### extensions

```ts
extensions: string[];
```

Defined in: [packages/sdk/src/ui-service.ts:19](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L19)

Extensions this group matches, **without** the leading dot, e.g. `["json"]`.
