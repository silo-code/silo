# Interface: NotifyAction

Defined in: [packages/sdk/src/ui-service.ts:135](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L135)

One action button rendered in a toast — see [NotifyOptions.actions](NotifyOptions.md#actions).
The host themes the button; the extension supplies the label and what to do.

## Properties

### label

```ts
label: string;
```

Defined in: [packages/sdk/src/ui-service.ts:137](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L137)

The button's text.

***

### run

```ts
run: () => void | Promise<void>;
```

Defined in: [packages/sdk/src/ui-service.ts:143](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L143)

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

Defined in: [packages/sdk/src/ui-service.ts:145](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L145)

Keep the toast open after [NotifyAction.run](#run) (default: dismiss it).
