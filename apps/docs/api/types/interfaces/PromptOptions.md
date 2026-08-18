# Interface: PromptOptions

Defined in: [packages/sdk/src/ui-service.ts:114](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L114)

Options for [UiService.prompt](UiService.md#prompt) — a host-rendered single-line text input
dialog. Always dismissible (`Escape` and backdrop-click both resolve to
`null`, i.e. cancelled).

## Properties

### title

```ts
title: string;
```

Defined in: [packages/sdk/src/ui-service.ts:116](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L116)

The dialog's heading.

***

### label?

```ts
optional label?: string;
```

Defined in: [packages/sdk/src/ui-service.ts:118](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L118)

Optional label shown above the input.

***

### initialValue?

```ts
optional initialValue?: string;
```

Defined in: [packages/sdk/src/ui-service.ts:120](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L120)

Pre-fills the input (and is selected for easy replacement).

***

### placeholder?

```ts
optional placeholder?: string;
```

Defined in: [packages/sdk/src/ui-service.ts:122](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L122)

Placeholder shown when the input is empty.

***

### confirmLabel?

```ts
optional confirmLabel?: string;
```

Defined in: [packages/sdk/src/ui-service.ts:124](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L124)

Label for the confirm button. Default `"OK"`.

***

### cancelLabel?

```ts
optional cancelLabel?: string;
```

Defined in: [packages/sdk/src/ui-service.ts:126](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L126)

Label for the cancel button. Default `"Cancel"`.
