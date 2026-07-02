# Interface: NetworkRequestOptions

Defined in: [packages/sdk/src/network-service.ts:39](https://github.com/silo-code/silo/blob/main/packages/sdk/src/network-service.ts#L39)

Options for [NetworkService.fetch](NetworkService.md#fetch) and [NetworkService.fetchHeaders](NetworkService.md#fetchheaders).

## Properties

### method?

```ts
optional method?: "GET" | "HEAD" | "POST" | "PUT" | "DELETE" | "PATCH";
```

Defined in: [packages/sdk/src/network-service.ts:44](https://github.com/silo-code/silo/blob/main/packages/sdk/src/network-service.ts#L44)

HTTP method. Defaults to `"GET"` for [NetworkService.fetch](NetworkService.md#fetch) and
`"HEAD"` for [NetworkService.fetchHeaders](NetworkService.md#fetchheaders).

***

### headers?

```ts
optional headers?: Record<string, string>;
```

Defined in: [packages/sdk/src/network-service.ts:46](https://github.com/silo-code/silo/blob/main/packages/sdk/src/network-service.ts#L46)

Request headers to send.

***

### body?

```ts
optional body?: string;
```

Defined in: [packages/sdk/src/network-service.ts:48](https://github.com/silo-code/silo/blob/main/packages/sdk/src/network-service.ts#L48)

Request body (string). Only meaningful for methods that carry a body.

***

### followRedirects?

```ts
optional followRedirects?: boolean;
```

Defined in: [packages/sdk/src/network-service.ts:50](https://github.com/silo-code/silo/blob/main/packages/sdk/src/network-service.ts#L50)

Follow HTTP redirects. Defaults to `true`.

***

### timeoutMs?

```ts
optional timeoutMs?: number;
```

Defined in: [packages/sdk/src/network-service.ts:52](https://github.com/silo-code/silo/blob/main/packages/sdk/src/network-service.ts#L52)

Request timeout in milliseconds. Omit for the platform default (~30 s).
