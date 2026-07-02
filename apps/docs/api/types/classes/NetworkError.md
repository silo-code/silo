# Class: NetworkError

Defined in: [packages/sdk/src/network-service.ts:18](https://github.com/silo-code/silo/blob/main/packages/sdk/src/network-service.ts#L18)

Thrown by [NetworkService.fetch](../interfaces/NetworkService.md#fetch) and [NetworkService.fetchHeaders](../interfaces/NetworkService.md#fetchheaders)
when a request fails (network error, DNS failure, TLS error, timeout, etc.).

```ts
try {
  const res = await ctx.net.fetch("https://api.example.com/data");
} catch (err) {
  if (err instanceof NetworkError) {
    console.error(`Request to ${err.url} failed: ${err.message}`);
  }
}
```

## Extends

- `Error`

## Constructors

### Constructor

```ts
new NetworkError(url, message): NetworkError;
```

Defined in: [packages/sdk/src/network-service.ts:22](https://github.com/silo-code/silo/blob/main/packages/sdk/src/network-service.ts#L22)

#### Parameters

##### url

`string`

##### message

`string`

#### Returns

`NetworkError`

#### Overrides

```ts
Error.constructor
```

## Properties

### url

```ts
readonly url: string;
```

Defined in: [packages/sdk/src/network-service.ts:20](https://github.com/silo-code/silo/blob/main/packages/sdk/src/network-service.ts#L20)

The URL that was requested when the error occurred.

***

### name

```ts
name: string;
```

Defined in: node\_modules/.pnpm/typescript@5.8.3/node\_modules/typescript/lib/lib.es5.d.ts:1076

#### Inherited from

```ts
Error.name
```

***

### message

```ts
message: string;
```

Defined in: node\_modules/.pnpm/typescript@5.8.3/node\_modules/typescript/lib/lib.es5.d.ts:1077

#### Inherited from

```ts
Error.message
```

***

### stack?

```ts
optional stack?: string;
```

Defined in: node\_modules/.pnpm/typescript@5.8.3/node\_modules/typescript/lib/lib.es5.d.ts:1078

#### Inherited from

```ts
Error.stack
```
