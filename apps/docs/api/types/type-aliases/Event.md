# Type Alias: Event\<T\>

```ts
type Event<T> = (listener) => Disposable;
```

Defined in: [packages/sdk/src/event.ts:28](https://github.com/silo-code/silo/blob/main/packages/sdk/src/event.ts#L28)

A subscribable event: call it with a listener and receive a
[Disposable](../interfaces/Disposable.md) that cancels the subscription. Modeled on VS Code's
`Event<T>` convention.

Services that emit events expose a member typed as `Event<T>` — the
consuming extension calls it directly and pushes the returned disposable
onto `ctx.subscriptions`:

## Type Parameters

### T

`T`

## Parameters

### listener

(`e`) => `void`

## Returns

[`Disposable`](../interfaces/Disposable.md)

## Example

```ts
ctx.subscriptions.push(
  ctx.editors.onDidSave(({ editorId, filePath }) => {
    console.log("saved", filePath);
  }),
);
```

**Host-side:** the matching emitter (`EventEmitter<T>`) lives in the
extension-host package (not the SDK). Only the subscribable `Event<T>` type
is public — extensions never construct emitters.
