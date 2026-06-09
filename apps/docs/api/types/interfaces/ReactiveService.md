# Interface: ReactiveService\<T\>

Defined in: [packages/sdk/src/use-service-state.ts:13](https://github.com/silo-code/silo/blob/main/packages/sdk/src/use-service-state.ts#L13)

The minimal reactive contract every stateful `ctx` service satisfies: a
`getState` returning a stable, frozen value and a `subscribe` that fires
on change. This is exactly what React's `useSyncExternalStore` needs — and
the only shape [useServiceState](../functions/useServiceState.md) requires.

## Type Parameters

### T

`T`

## Methods

### getState()

```ts
getState(): T;
```

Defined in: [packages/sdk/src/use-service-state.ts:14](https://github.com/silo-code/silo/blob/main/packages/sdk/src/use-service-state.ts#L14)

#### Returns

`T`

***

### subscribe()

```ts
subscribe(listener): Disposable;
```

Defined in: [packages/sdk/src/use-service-state.ts:15](https://github.com/silo-code/silo/blob/main/packages/sdk/src/use-service-state.ts#L15)

#### Parameters

##### listener

(`s`) => `void`

#### Returns

[`Disposable`](Disposable.md)
