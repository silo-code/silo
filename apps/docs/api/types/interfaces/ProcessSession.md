# Interface: ProcessSession

Defined in: [packages/sdk/src/process-service.ts:36](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L36)

A live handle to one persistent process session, returned by
[ProcessService.spawn](ProcessService.md#spawn) / [ProcessService.attach](ProcessService.md#attach). The underlying
session **survives app restarts** — re-`attach` by [ProcessSession.id](#id)
to reconnect to a still-running session.

## Properties

### id

```ts
readonly id: string;
```

Defined in: [packages/sdk/src/process-service.ts:38](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L38)

Stable session id; pass to [ProcessService.attach](ProcessService.md#attach) to reconnect.

## Methods

### write()

```ts
write(data): void;
```

Defined in: [packages/sdk/src/process-service.ts:40](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L40)

Write input to the session (e.g. keystrokes).

#### Parameters

##### data

`string`

#### Returns

`void`

***

### resize()

```ts
resize(cols, rows): void;
```

Defined in: [packages/sdk/src/process-service.ts:42](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L42)

Notify the session its viewport size changed.

#### Parameters

##### cols

`number`

##### rows

`number`

#### Returns

`void`

***

### kill()

```ts
kill(): Promise<void>;
```

Defined in: [packages/sdk/src/process-service.ts:44](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L44)

Terminate the session and release it.

#### Returns

`Promise`\<`void`\>

***

### getBuffer()

```ts
getBuffer(): Promise<string>;
```

Defined in: [packages/sdk/src/process-service.ts:46](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L46)

Fetch the persisted output buffer (to restore a view after re-attach).

#### Returns

`Promise`\<`string`\>

***

### saveBuffer()

```ts
saveBuffer(data): Promise<void>;
```

Defined in: [packages/sdk/src/process-service.ts:48](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L48)

Persist an output buffer for later restore.

#### Parameters

##### data

`string`

#### Returns

`Promise`\<`void`\>

***

### onData()

```ts
onData(listener): Disposable;
```

Defined in: [packages/sdk/src/process-service.ts:50](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L50)

Subscribe to output data. Dispose to stop listening.

#### Parameters

##### listener

(`data`) => `void`

#### Returns

[`Disposable`](Disposable.md)

***

### onExit()

```ts
onExit(listener): Disposable;
```

Defined in: [packages/sdk/src/process-service.ts:52](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L52)

Subscribe to session exit. Dispose to stop listening.

#### Parameters

##### listener

(`exitCode`) => `void`

#### Returns

[`Disposable`](Disposable.md)
