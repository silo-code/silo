# Interface: NetworkResponse

Defined in: [packages/sdk/src/network-service.ts:65](https://github.com/silo-code/silo/blob/main/packages/sdk/src/network-service.ts#L65)

Response from [NetworkService.fetch](NetworkService.md#fetch).

## Properties

### status

```ts
status: number;
```

Defined in: [packages/sdk/src/network-service.ts:67](https://github.com/silo-code/silo/blob/main/packages/sdk/src/network-service.ts#L67)

HTTP status code.

***

### headers

```ts
headers: Record<string, string>;
```

Defined in: [packages/sdk/src/network-service.ts:72](https://github.com/silo-code/silo/blob/main/packages/sdk/src/network-service.ts#L72)

Response headers, lowercased. Multi-value headers are joined with `", "`,
matching the HTTP/1.1 field-value combining rule.

***

### body

```ts
body: string;
```

Defined in: [packages/sdk/src/network-service.ts:74](https://github.com/silo-code/silo/blob/main/packages/sdk/src/network-service.ts#L74)

Response body decoded as UTF-8 text.

***

### finalUrl

```ts
finalUrl: string;
```

Defined in: [packages/sdk/src/network-service.ts:76](https://github.com/silo-code/silo/blob/main/packages/sdk/src/network-service.ts#L76)

Final URL after redirects.
