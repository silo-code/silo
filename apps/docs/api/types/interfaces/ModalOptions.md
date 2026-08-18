# Interface: ModalOptions

Defined in: [packages/sdk/src/ui-service.ts:183](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L183)

Options for [UiService.showModal](UiService.md#showmodal) — the host-owned chrome around your
custom modal content. The host owns the backdrop, z-order (stacking above all
host chrome, arbitrated centrally), focus trap, and restore-focus-on-close;
you supply the content and these presentation options.

Unlike [ConfirmOptions](ConfirmOptions.md) / [PromptOptions](PromptOptions.md), a `showModal` dialog is
**not dismissible by default** — set [ModalOptions.dismissible](#dismissible) to wire
`Escape` + backdrop-click to close (guarding staged edits otherwise).

## Properties

### title?

```ts
optional title?: ReactNode;
```

Defined in: [packages/sdk/src/ui-service.ts:185](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L185)

Optional header rendered at the top of the card; omit for bare layouts.

***

### dismissible?

```ts
optional dismissible?: boolean;
```

Defined in: [packages/sdk/src/ui-service.ts:192](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L192)

Allow `Escape` and backdrop-click to close the modal (resolving the
[UiService.showModal](UiService.md#showmodal) promise with `undefined`). Defaults to
**`false`** — the modal stays open until your content calls `close`,
guarding against accidental loss of staged edits.

***

### size?

```ts
optional size?: "sm" | "md" | "lg";
```

Defined in: [packages/sdk/src/ui-service.ts:194](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L194)

Width preset for the card. Default `"md"`. Ignored when `bare`.

***

### bare?

```ts
optional bare?: boolean;
```

Defined in: [packages/sdk/src/ui-service.ts:200](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L200)

Skip the card chrome — your content *is* the card (it supplies its own
background/size). The host still owns the backdrop, stacking, and focus
trap. Used by full-bleed layouts.

***

### className?

```ts
optional className?: string;
```

Defined in: [packages/sdk/src/ui-service.ts:202](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L202)

Extra class on the card, for special-case layouts.

***

### ariaLabel?

```ts
optional ariaLabel?: string;
```

Defined in: [packages/sdk/src/ui-service.ts:204](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L204)

Accessible name for dialogs without a visible [ModalOptions.title](#title).
