# Interface: NotifyOptions

Defined in: [packages/sdk/src/ui-service.ts:155](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L155)

Options for [UiService.notify](UiService.md#notify) — an optional title, action buttons, and
auto-dismiss control layered on top of the toast's `level` + `message`.

## Properties

### title?

```ts
optional title?: string;
```

Defined in: [packages/sdk/src/ui-service.ts:157](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L157)

A short bold heading rendered above the `message`.

***

### actions?

```ts
optional actions?: NotifyAction[];
```

Defined in: [packages/sdk/src/ui-service.ts:159](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L159)

Action buttons rendered in the toast's footer (see [NotifyAction](NotifyAction.md)).

***

### durationMs?

```ts
optional durationMs?: number;
```

Defined in: [packages/sdk/src/ui-service.ts:166](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L166)

Auto-dismiss delay in milliseconds. Omit for the default behavior: `error`
toasts and any toast with [actions](#actions) stay until
the user dismisses them, while `info` / `warn` auto-dismiss after ~4s. Pass
`0` to force "stay until dismissed"; a positive number sets an explicit delay.
