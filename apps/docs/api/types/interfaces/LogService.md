# Interface: LogService

Defined in: [packages/sdk/src/output-service.ts:30](https://github.com/silo-code/silo/blob/main/packages/sdk/src/output-service.ts#L30)

Write-only structured logger automatically scoped to the calling extension.
A channel is created for the extension at activation time and removed when
the extension deactivates — no setup needed; just call `ctx.log.info("...")`.

All entries appear in the **Output** panel (`core.openOutput`) under the
extension's display name. Use [LogService.show](#show) to focus the panel and
select this extension's channel.

## Methods

### debug()

```ts
debug(message, data?): void;
```

Defined in: [packages/sdk/src/output-service.ts:32](https://github.com/silo-code/silo/blob/main/packages/sdk/src/output-service.ts#L32)

Append a debug-level entry. Use for verbose diagnostic output.

#### Parameters

##### message

`string`

##### data?

`unknown`

#### Returns

`void`

***

### info()

```ts
info(message, data?): void;
```

Defined in: [packages/sdk/src/output-service.ts:34](https://github.com/silo-code/silo/blob/main/packages/sdk/src/output-service.ts#L34)

Append an info-level entry. The default level for routine progress.

#### Parameters

##### message

`string`

##### data?

`unknown`

#### Returns

`void`

***

### warn()

```ts
warn(message, data?): void;
```

Defined in: [packages/sdk/src/output-service.ts:36](https://github.com/silo-code/silo/blob/main/packages/sdk/src/output-service.ts#L36)

Append a warn-level entry. Something unexpected but recoverable.

#### Parameters

##### message

`string`

##### data?

`unknown`

#### Returns

`void`

***

### error()

```ts
error(message, data?): void;
```

Defined in: [packages/sdk/src/output-service.ts:38](https://github.com/silo-code/silo/blob/main/packages/sdk/src/output-service.ts#L38)

Append an error-level entry. A failure the user should know about.

#### Parameters

##### message

`string`

##### data?

`unknown`

#### Returns

`void`

***

### show()

```ts
show(): void;
```

Defined in: [packages/sdk/src/output-service.ts:40](https://github.com/silo-code/silo/blob/main/packages/sdk/src/output-service.ts#L40)

Open (or focus) the Output panel and select this extension's channel.

#### Returns

`void`

***

### clear()

```ts
clear(): void;
```

Defined in: [packages/sdk/src/output-service.ts:42](https://github.com/silo-code/silo/blob/main/packages/sdk/src/output-service.ts#L42)

Clear this extension's output channel entries.

#### Returns

`void`
