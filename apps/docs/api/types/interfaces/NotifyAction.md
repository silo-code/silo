# Interface: NotifyAction

Defined in: [packages/sdk/src/ui-service.ts:136](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L136)

One action button rendered in a toast — see [NotifyOptions.actions](NotifyOptions.md#actions).
The host themes the button; the extension supplies the label and what to do.

## Properties

### label

```ts
label: string;
```

Defined in: [packages/sdk/src/ui-service.ts:138](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L138)

The button's text.

***

### run

```ts
run: () => void | Promise<void>;
```

Defined in: [packages/sdk/src/ui-service.ts:144](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L144)

Invoked when the button is clicked. The toast then dismisses unless
[NotifyAction.keepOpen](#keepopen) is set — so a "View details" action that opens
a modal can close the toast behind it.

#### Returns

`void` \| `Promise`\<`void`\>

***

### keepOpen?

```ts
optional keepOpen?: boolean;
```

Defined in: [packages/sdk/src/ui-service.ts:146](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L146)

Keep the toast open after [NotifyAction.run](#run) (default: dismiss it).
