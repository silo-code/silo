# Interface: ConfirmOptions

Defined in: [packages/sdk/src/ui-service.ts:92](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L92)

Options for [UiService.confirm](UiService.md#confirm) — a host-rendered yes/no dialog. Always
dismissible (`Escape` and backdrop-click both resolve to `false`, the safe
choice). Set [danger](#danger) for destructive actions.

## Properties

### title

```ts
title: string;
```

Defined in: [packages/sdk/src/ui-service.ts:94](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L94)

The dialog's heading.

***

### body?

```ts
optional body?: string;
```

Defined in: [packages/sdk/src/ui-service.ts:96](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L96)

Optional explanatory line beneath the title.

***

### confirmLabel?

```ts
optional confirmLabel?: string;
```

Defined in: [packages/sdk/src/ui-service.ts:98](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L98)

Label for the confirm button. Default `"OK"`.

***

### cancelLabel?

```ts
optional cancelLabel?: string;
```

Defined in: [packages/sdk/src/ui-service.ts:100](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L100)

Label for the cancel button. Default `"Cancel"`.

***

### danger?

```ts
optional danger?: boolean;
```

Defined in: [packages/sdk/src/ui-service.ts:102](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L102)

Style the confirm button as destructive (`.silo-button-danger`).
