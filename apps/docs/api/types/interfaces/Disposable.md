# Interface: Disposable

Defined in: [packages/sdk/src/types.ts:58](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L58)

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

Defined in: [packages/sdk/src/types.ts:59](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L59)

#### Returns

`void`
