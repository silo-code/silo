# Interface: NetworkService

Defined in: [packages/sdk/src/network-service.ts:90](https://github.com/silo-code/silo/blob/main/packages/sdk/src/network-service.ts#L90)

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

Defined in: [packages/sdk/src/network-service.ts:105](https://github.com/silo-code/silo/blob/main/packages/sdk/src/network-service.ts#L105)

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

### fetchHeaders()

```ts
fetchHeaders(url, options?): Promise<Record<string, string>>;
```

Defined in: [packages/sdk/src/network-service.ts:126](https://github.com/silo-code/silo/blob/main/packages/sdk/src/network-service.ts#L126)

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
