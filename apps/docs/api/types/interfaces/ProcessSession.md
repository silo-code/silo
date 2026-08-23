# Interface: ProcessSession

Defined in: [packages/sdk/src/process-service.ts:49](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L49)

A live handle to one persistent process session, returned by
[ProcessService.spawn](ProcessService.md#spawn) / [ProcessService.attach](ProcessService.md#attach). The underlying
session **survives app restarts** — re-`attach` by [ProcessSession.id](#id)
to reconnect to a still-running session.

## Properties

### id

```ts
readonly id: string;
```

Defined in: [packages/sdk/src/process-service.ts:51](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L51)

Stable session id; pass to [ProcessService.attach](ProcessService.md#attach) to reconnect.

## Methods

### write()

```ts
write(data): void;
```

Defined in: [packages/sdk/src/process-service.ts:53](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L53)

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

Defined in: [packages/sdk/src/process-service.ts:55](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L55)

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

Defined in: [packages/sdk/src/process-service.ts:57](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L57)

Terminate the session and release it.

#### Returns

`Promise`\<`void`\>

***

### getBuffer()

```ts
getBuffer(): Promise<string>;
```

Defined in: [packages/sdk/src/process-service.ts:59](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L59)

Fetch the persisted output buffer (to restore a view after re-attach).

#### Returns

`Promise`\<`string`\>

***

### saveBuffer()

```ts
saveBuffer(data): Promise<void>;
```

Defined in: [packages/sdk/src/process-service.ts:61](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L61)

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

Defined in: [packages/sdk/src/process-service.ts:63](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L63)

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

Defined in: [packages/sdk/src/process-service.ts:65](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L65)

Subscribe to session exit. Dispose to stop listening.

#### Parameters

##### listener

(`exitCode`) => `void`

#### Returns

[`Disposable`](Disposable.md)
