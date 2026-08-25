# Interface: ConfirmDontShowAgainOptions

Defined in: [packages/sdk/src/ui-service.ts:227](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L227)

Options for [UiService.confirmWithDontShowAgain](UiService.md#confirmwithdontshowagain).

## Properties

### storageKey

```ts
storageKey: string;
```

Defined in: [packages/sdk/src/ui-service.ts:234](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L234)

Key in the **calling extension's** global storage
([ExtensionContext.storage](ExtensionContext.md#storage)`.global`) that remembers the user opted
out. The host binds storage to the caller — you don't pass an
`ExtensionStorage` handle yourself.

***

### title

```ts
title: string;
```

Defined in: [packages/sdk/src/ui-service.ts:236](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L236)

The dialog's heading.

***

### body

```ts
body: string;
```

Defined in: [packages/sdk/src/ui-service.ts:238](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L238)

Explanatory body text.

***

### confirmLabel

```ts
confirmLabel: string;
```

Defined in: [packages/sdk/src/ui-service.ts:240](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L240)

Label for the confirm/acknowledge button.

***

### mode

```ts
mode: ConfirmDontShowAgainMode;
```

Defined in: [packages/sdk/src/ui-service.ts:242](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L242)

Which two-button shape to render — see [ConfirmDontShowAgainMode](../type-aliases/ConfirmDontShowAgainMode.md).
