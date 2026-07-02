# Interface: NetworkResponse

Defined in: [packages/sdk/src/network-service.ts:61](https://github.com/silo-code/silo/blob/main/packages/sdk/src/network-service.ts#L61)

Response from [NetworkService.fetch](NetworkService.md#fetch).

## Properties

### status

```ts
status: number;
```

Defined in: [packages/sdk/src/network-service.ts:63](https://github.com/silo-code/silo/blob/main/packages/sdk/src/network-service.ts#L63)

HTTP status code.

***

### headers

```ts
headers: Record<string, string>;
```

Defined in: [packages/sdk/src/network-service.ts:68](https://github.com/silo-code/silo/blob/main/packages/sdk/src/network-service.ts#L68)

Response headers, lowercased. Multi-value headers are joined with `", "`,
matching the HTTP/1.1 field-value combining rule.

***

### body

```ts
body: string;
```

Defined in: [packages/sdk/src/network-service.ts:70](https://github.com/silo-code/silo/blob/main/packages/sdk/src/network-service.ts#L70)

Response body decoded as UTF-8 text.

***

### finalUrl

```ts
finalUrl: string;
```

Defined in: [packages/sdk/src/network-service.ts:72](https://github.com/silo-code/silo/blob/main/packages/sdk/src/network-service.ts#L72)

Final URL after redirects.
