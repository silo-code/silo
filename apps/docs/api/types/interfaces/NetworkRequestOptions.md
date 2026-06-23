# Interface: NetworkRequestOptions

Defined in: [packages/sdk/src/network-service.ts:7](https://github.com/silo-code/silo/blob/main/packages/sdk/src/network-service.ts#L7)

Options for [NetworkService.fetch](NetworkService.md#fetch) and [NetworkService.fetchHeaders](NetworkService.md#fetchheaders).

## Properties

### method?

```ts
optional method?: "GET" | "HEAD" | "POST" | "PUT" | "DELETE" | "PATCH";
```

Defined in: [packages/sdk/src/network-service.ts:12](https://github.com/silo-code/silo/blob/main/packages/sdk/src/network-service.ts#L12)

HTTP method. Defaults to `"GET"` for [NetworkService.fetch](NetworkService.md#fetch) and
`"HEAD"` for [NetworkService.fetchHeaders](NetworkService.md#fetchheaders).

***

### headers?

```ts
optional headers?: Record<string, string>;
```

Defined in: [packages/sdk/src/network-service.ts:14](https://github.com/silo-code/silo/blob/main/packages/sdk/src/network-service.ts#L14)

Request headers to send.

***

### body?

```ts
optional body?: string;
```

Defined in: [packages/sdk/src/network-service.ts:16](https://github.com/silo-code/silo/blob/main/packages/sdk/src/network-service.ts#L16)

Request body (string). Only meaningful for methods that carry a body.

***

### followRedirects?

```ts
optional followRedirects?: boolean;
```

Defined in: [packages/sdk/src/network-service.ts:18](https://github.com/silo-code/silo/blob/main/packages/sdk/src/network-service.ts#L18)

Follow HTTP redirects. Defaults to `true`.

***

### timeoutMs?

```ts
optional timeoutMs?: number;
```

Defined in: [packages/sdk/src/network-service.ts:20](https://github.com/silo-code/silo/blob/main/packages/sdk/src/network-service.ts#L20)

Request timeout in milliseconds. Omit for the platform default (~30 s).
