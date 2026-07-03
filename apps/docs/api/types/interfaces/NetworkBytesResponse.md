# Interface: NetworkBytesResponse

Defined in: [packages/sdk/src/network-service.ts:86](https://github.com/silo-code/silo/blob/main/packages/sdk/src/network-service.ts#L86)

Response from [NetworkService.fetchBytes](NetworkService.md#fetchbytes) — identical to
[NetworkResponse](NetworkResponse.md) but with the body delivered as raw bytes.

## Properties

### status

```ts
status: number;
```

Defined in: [packages/sdk/src/network-service.ts:88](https://github.com/silo-code/silo/blob/main/packages/sdk/src/network-service.ts#L88)

HTTP status code.

***

### headers

```ts
headers: Record<string, string>;
```

Defined in: [packages/sdk/src/network-service.ts:90](https://github.com/silo-code/silo/blob/main/packages/sdk/src/network-service.ts#L90)

Response headers, lowercased (multi-value joined with `", "`).

***

### body

```ts
body: ArrayBuffer;
```

Defined in: [packages/sdk/src/network-service.ts:92](https://github.com/silo-code/silo/blob/main/packages/sdk/src/network-service.ts#L92)

Response body as raw bytes.

***

### finalUrl

```ts
finalUrl: string;
```

Defined in: [packages/sdk/src/network-service.ts:94](https://github.com/silo-code/silo/blob/main/packages/sdk/src/network-service.ts#L94)

Final URL after redirects.
