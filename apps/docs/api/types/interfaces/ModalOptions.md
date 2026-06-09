# Interface: ModalOptions

Defined in: [packages/sdk/src/ui-service.ts:182](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L182)

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

Defined in: [packages/sdk/src/ui-service.ts:184](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L184)

Optional header rendered at the top of the card; omit for bare layouts.

***

### dismissible?

```ts
optional dismissible?: boolean;
```

Defined in: [packages/sdk/src/ui-service.ts:191](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L191)

Allow `Escape` and backdrop-click to close the modal (resolving the
[UiService.showModal](UiService.md#showmodal) promise with `undefined`). Defaults to
**`false`** — the modal stays open until your content calls `close`,
guarding against accidental loss of staged edits.

***

### size?

```ts
optional size?: "sm" | "md" | "lg";
```

Defined in: [packages/sdk/src/ui-service.ts:193](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L193)

Width preset for the card. Default `"md"`. Ignored when `bare`.

***

### bare?

```ts
optional bare?: boolean;
```

Defined in: [packages/sdk/src/ui-service.ts:199](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L199)

Skip the card chrome — your content *is* the card (it supplies its own
background/size). The host still owns the backdrop, stacking, and focus
trap. Used by full-bleed layouts.

***

### className?

```ts
optional className?: string;
```

Defined in: [packages/sdk/src/ui-service.ts:201](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L201)

Extra class on the card, for special-case layouts.

***

### ariaLabel?

```ts
optional ariaLabel?: string;
```

Defined in: [packages/sdk/src/ui-service.ts:203](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L203)

Accessible name for dialogs without a visible [ModalOptions.title](#title).
