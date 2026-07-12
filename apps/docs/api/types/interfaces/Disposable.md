# Interface: Disposable

Defined in: [packages/sdk/src/types.ts:59](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L59)

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

Defined in: [packages/sdk/src/types.ts:60](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L60)

#### Returns

`void`
