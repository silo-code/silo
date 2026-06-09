# Interface: PromptOptions

Defined in: [packages/sdk/src/ui-service.ts:113](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L113)

Options for [UiService.prompt](UiService.md#prompt) — a host-rendered single-line text input
dialog. Always dismissible (`Escape` and backdrop-click both resolve to
`null`, i.e. cancelled).

## Properties

### title

```ts
title: string;
```

Defined in: [packages/sdk/src/ui-service.ts:115](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L115)

The dialog's heading.

***

### label?

```ts
optional label?: string;
```

Defined in: [packages/sdk/src/ui-service.ts:117](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L117)

Optional label shown above the input.

***

### initialValue?

```ts
optional initialValue?: string;
```

Defined in: [packages/sdk/src/ui-service.ts:119](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L119)

Pre-fills the input (and is selected for easy replacement).

***

### placeholder?

```ts
optional placeholder?: string;
```

Defined in: [packages/sdk/src/ui-service.ts:121](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L121)

Placeholder shown when the input is empty.

***

### confirmLabel?

```ts
optional confirmLabel?: string;
```

Defined in: [packages/sdk/src/ui-service.ts:123](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L123)

Label for the confirm button. Default `"OK"`.

***

### cancelLabel?

```ts
optional cancelLabel?: string;
```

Defined in: [packages/sdk/src/ui-service.ts:125](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L125)

Label for the cancel button. Default `"Cancel"`.
