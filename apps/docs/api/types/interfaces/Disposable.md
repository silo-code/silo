# Interface: Disposable

Defined in: [packages/sdk/src/types.ts:66](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L66)

The teardown handle returned by every `register*` call on
[ExtensionContext](ExtensionContext.md). Calling [dispose](#dispose)
removes the contribution. Disposables are also collected on
[ExtensionContext.subscriptions](ExtensionContext.md#subscriptions) so the host can tear an extension
down wholesale.

## Extended by

- [`WebFrame`](WebFrame.md)

## Methods

### dispose()

```ts
dispose(): void;
```

Defined in: [packages/sdk/src/types.ts:67](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L67)

#### Returns

`void`
