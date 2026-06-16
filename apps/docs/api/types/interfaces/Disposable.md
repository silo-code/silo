# Interface: Disposable

Defined in: [packages/sdk/src/types.ts:45](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L45)

The teardown handle returned by every `register*` call on
[ExtensionContext](ExtensionContext.md). Calling [dispose](#dispose)
removes the contribution. Disposables are also collected on
[ExtensionContext.subscriptions](ExtensionContext.md#subscriptions) so the host can tear an extension
down wholesale.

## Methods

### dispose()

```ts
dispose(): void;
```

Defined in: [packages/sdk/src/types.ts:46](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L46)

#### Returns

`void`
