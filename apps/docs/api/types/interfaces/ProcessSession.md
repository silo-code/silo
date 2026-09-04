# Interface: ProcessSession

Defined in: [packages/sdk/src/process-service.ts:50](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L50)

A live handle to one persistent process session, returned by
[ProcessService.spawn](ProcessService.md#spawn) / [ProcessService.attach](ProcessService.md#attach). The underlying
session **survives app restarts** — re-`attach` by [ProcessSession.id](#id)
to reconnect to a still-running session.

## Properties

### id

```ts
readonly id: string;
```

Defined in: [packages/sdk/src/process-service.ts:52](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L52)

Stable session id; pass to [ProcessService.attach](ProcessService.md#attach) to reconnect.

## Methods

### write()

```ts
write(data): void;
```

Defined in: [packages/sdk/src/process-service.ts:54](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L54)

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

Defined in: [packages/sdk/src/process-service.ts:56](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L56)

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

Defined in: [packages/sdk/src/process-service.ts:58](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L58)

Terminate the session and release it.

#### Returns

`Promise`\<`void`\>

***

### getBuffer()

```ts
getBuffer(): Promise<string>;
```

Defined in: [packages/sdk/src/process-service.ts:60](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L60)

Fetch the persisted output buffer (to restore a view after re-attach).

#### Returns

`Promise`\<`string`\>

***

### saveBuffer()

```ts
saveBuffer(data): Promise<void>;
```

Defined in: [packages/sdk/src/process-service.ts:62](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L62)

Persist an output buffer for later restore.

#### Parameters

##### data

`string`

#### Returns

`Promise`\<`void`\>

***

### onData()

```ts
onData(listener, options?): Disposable;
```

Defined in: [packages/sdk/src/process-service.ts:73](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L73)

Subscribe to output data. Dispose to stop listening.

By default only **live** output is delivered. A session survives app
restarts, so re-attaching to one replays its recent scrollback; delivering
that by default would make every reattach look like a burst of output
arriving right now. Pass `{ includeReplay: true }` to receive the replayed
history too — for instance to paint scrollback into a fresh view — and read
`origin.replay` to tell the two apart.

#### Parameters

##### listener

(`data`, `origin`) => `void`

##### options?

[`SubscribeOutputOptions`](SubscribeOutputOptions.md)

#### Returns

[`Disposable`](Disposable.md)

***

### onExit()

```ts
onExit(listener): Disposable;
```

Defined in: [packages/sdk/src/process-service.ts:78](https://github.com/silo-code/silo/blob/main/packages/sdk/src/process-service.ts#L78)

Subscribe to session exit. Dispose to stop listening.

#### Parameters

##### listener

(`exitCode`) => `void`

#### Returns

[`Disposable`](Disposable.md)
