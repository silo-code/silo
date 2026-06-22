# Interface: NetworkResponse

Defined in: [packages/sdk/src/network-service.ts:29](https://github.com/silo-code/silo/blob/main/packages/sdk/src/network-service.ts#L29)

Response from [NetworkService.fetch](NetworkService.md#fetch).

## Properties

### status

```ts
status: number;
```

Defined in: [packages/sdk/src/network-service.ts:31](https://github.com/silo-code/silo/blob/main/packages/sdk/src/network-service.ts#L31)

HTTP status code.

***

### headers

```ts
headers: Record<string, string>;
```

Defined in: [packages/sdk/src/network-service.ts:36](https://github.com/silo-code/silo/blob/main/packages/sdk/src/network-service.ts#L36)

Response headers, lowercased. Multi-value headers are joined with `", "`,
matching the HTTP/1.1 field-value combining rule.

***

### body

```ts
body: string;
```

Defined in: [packages/sdk/src/network-service.ts:38](https://github.com/silo-code/silo/blob/main/packages/sdk/src/network-service.ts#L38)

Response body decoded as UTF-8 text.

***

### finalUrl

```ts
finalUrl: string;
```

Defined in: [packages/sdk/src/network-service.ts:40](https://github.com/silo-code/silo/blob/main/packages/sdk/src/network-service.ts#L40)

Final URL after redirects.
