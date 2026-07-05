# Interface: NetworkService

Defined in: [packages/sdk/src/network-service.ts:112](https://github.com/silo-code/silo/blob/main/packages/sdk/src/network-service.ts#L112)

Server-side HTTP client exposed as [ExtensionContext.net](ExtensionContext.md#net). Requests
run in the Rust backend via `reqwest`, so they bypass the browser's CORS
policy and can read response headers that the browser would otherwise hide
from cross-origin requests.

Typical use-cases:
- Checking `X-Frame-Options` / CSP `frame-ancestors` before embedding a URL
  in an `<iframe>` (see the Web Viewer extension).
- Probing a `localhost` dev server that has no CORS headers.
- Fetching data from an external API that doesn't grant cross-origin access.

## Methods

### fetch()

```ts
fetch(url, options?): Promise<NetworkResponse>;
```

Defined in: [packages/sdk/src/network-service.ts:127](https://github.com/silo-code/silo/blob/main/packages/sdk/src/network-service.ts#L127)

Make an HTTP request server-side, bypassing CORS. Returns the full
response: status, headers, body, and the final URL after any redirects.

#### Parameters

##### url

`string`

The URL to fetch.

##### options?

[`NetworkRequestOptions`](NetworkRequestOptions.md)

Method, headers, body, redirect and timeout controls.

#### Returns

`Promise`\<[`NetworkResponse`](NetworkResponse.md)\>

#### Throws

[NetworkError](../classes/NetworkError.md) if the request fails (network error, DNS
  failure, TLS error, etc.).

#### Example

```ts
const { status, body } = await ctx.net.fetch("https://api.example.com/data");
```

***

### fetchBytes()

```ts
fetchBytes(url, options?): Promise<NetworkBytesResponse>;
```

Defined in: [packages/sdk/src/network-service.ts:151](https://github.com/silo-code/silo/blob/main/packages/sdk/src/network-service.ts#L151)

Like [NetworkService.fetch](#fetch), but resolves the response body as raw
bytes ([NetworkBytesResponse](NetworkBytesResponse.md)) instead of decoding it as UTF-8 text —
for downloading images, archives, or any binary payload.

#### Parameters

##### url

`string`

The URL to fetch.

##### options?

[`NetworkRequestOptions`](NetworkRequestOptions.md)

Method, headers, body, redirect and timeout controls. The
  body may itself be binary (`ArrayBuffer` / `Uint8Array`).

#### Returns

`Promise`\<[`NetworkBytesResponse`](NetworkBytesResponse.md)\>

#### Throws

[NetworkError](../classes/NetworkError.md) if the request fails.

#### Remarks

The body rides Tauri's binary IPC channel (no base64), but the whole
response is still buffered in memory on both sides — suitable for typical
asset downloads (up to a few tens of MB), not for streaming multi-hundred-MB
files.

#### Example

```ts
const { body } = await ctx.net.fetchBytes("https://example.com/logo.png");
await ctx.files.writeBytes("logo.png", body);
```

***

### fetchHeaders()

```ts
fetchHeaders(url, options?): Promise<Record<string, string>>;
```

Defined in: [packages/sdk/src/network-service.ts:175](https://github.com/silo-code/silo/blob/main/packages/sdk/src/network-service.ts#L175)

Send a `HEAD` request and return only the response headers — no body is
downloaded. More efficient than [NetworkService.fetch](#fetch) when you only
need to inspect headers (e.g. checking embeddability before loading an
iframe).

Header names are lowercased; multi-value headers are joined with `", "`.

#### Parameters

##### url

`string`

The URL to probe.

##### options?

`Pick`\<[`NetworkRequestOptions`](NetworkRequestOptions.md), `"followRedirects"` \| `"timeoutMs"`\>

Redirect and timeout controls (`method` and `body` are
  ignored — this is always a HEAD request).

#### Returns

`Promise`\<`Record`\<`string`, `string`\>\>

#### Throws

[NetworkError](../classes/NetworkError.md) if the request fails.

#### Example

```ts
const headers = await ctx.net.fetchHeaders("https://github.com");
const blocked = headers["x-frame-options"] === "deny";
```
