# Interface: Disposable

Defined in: [packages/sdk/src/types.ts:62](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L62)

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

Defined in: [packages/sdk/src/types.ts:63](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L63)

#### Returns

`void`
