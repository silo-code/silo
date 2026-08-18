# Interface: ConfirmOptions

Defined in: [packages/sdk/src/ui-service.ts:93](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L93)

Options for [UiService.confirm](UiService.md#confirm) — a host-rendered yes/no dialog. Always
dismissible (`Escape` and backdrop-click both resolve to `false`, the safe
choice). Set [danger](#danger) for destructive actions.

## Properties

### title

```ts
title: string;
```

Defined in: [packages/sdk/src/ui-service.ts:95](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L95)

The dialog's heading.

***

### body?

```ts
optional body?: string;
```

Defined in: [packages/sdk/src/ui-service.ts:97](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L97)

Optional explanatory line beneath the title.

***

### confirmLabel?

```ts
optional confirmLabel?: string;
```

Defined in: [packages/sdk/src/ui-service.ts:99](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L99)

Label for the confirm button. Default `"OK"`.

***

### cancelLabel?

```ts
optional cancelLabel?: string;
```

Defined in: [packages/sdk/src/ui-service.ts:101](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L101)

Label for the cancel button. Default `"Cancel"`.

***

### danger?

```ts
optional danger?: boolean;
```

Defined in: [packages/sdk/src/ui-service.ts:103](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L103)

Style the confirm button as destructive (`.silo-button-danger`).
