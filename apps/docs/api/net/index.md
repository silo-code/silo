# ctx.net <Badge type="tip" text="stable" />

Server-side HTTP client — the **only** sanctioned way to make outbound network
requests from an extension. Requests run in the Rust backend via
[`reqwest`](https://docs.rs/reqwest), so they bypass the browser's CORS policy
and can read response headers that the browser would otherwise hide from
cross-origin requests.

```ts
ctx.net: NetworkService
```

Typical use-cases:

- Checking `X-Frame-Options` / CSP `frame-ancestors` before embedding a URL in
  an `<iframe>` (used by the Local Web Viewer extension).
- Probing a `localhost` dev server that has no CORS headers.
- Fetching data from an external API that doesn't grant cross-origin access.

## Methods

### `ctx.net.fetch(url, options?)` {#fetch}

Make an HTTP request server-side, bypassing CORS. Returns the full response:
status, headers, body, and the final URL after any redirects.

```ts
fetch(url: string, options?: NetworkRequestOptions): Promise<NetworkResponse>
```

**Throws** a string error message if the request fails (network error, DNS
failure, TLS error, timeout, etc.).

```ts
const { status, headers, body, finalUrl } = await ctx.net.fetch(
  "https://api.example.com/data",
);

// POST with a JSON body
const res = await ctx.net.fetch("https://api.example.com/items", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "example" }),
  timeoutMs: 5000,
});
```

### `ctx.net.fetchHeaders(url, options?)` {#fetchHeaders}

Send a `HEAD` request and return only the response headers — no body is
downloaded. More efficient than `fetch` when you only need to inspect headers.

```ts
fetchHeaders(
  url: string,
  options?: Pick<NetworkRequestOptions, "followRedirects" | "timeoutMs">,
): Promise<Record<string, string>>
```

Header names are lowercased; multi-value headers are joined with `", "`.

**Throws** a string error message if the request fails.

```ts
// Check whether a URL can be embedded in an iframe
const headers = await ctx.net.fetchHeaders("http://localhost:5173", {
  timeoutMs: 8000,
});

const xfo = headers["x-frame-options"]?.toLowerCase();
const blocked = xfo === "deny" || xfo === "sameorigin";
```

## Options

### `NetworkRequestOptions`

| Field             | Type                                        | Default    | Description                                                  |
| ----------------- | ------------------------------------------- | ---------- | ------------------------------------------------------------ |
| `method`          | `"GET" \| "HEAD" \| "POST" \| "PUT" \| ...` | `"GET"`    | HTTP method. Ignored by `fetchHeaders` (always `HEAD`).      |
| `headers`         | `Record<string, string>`                    | —          | Request headers to send.                                     |
| `body`            | `string`                                    | —          | Request body. Only meaningful for methods that carry a body. |
| `followRedirects` | `boolean`                                   | `true`     | Follow HTTP redirects.                                       |
| `timeoutMs`       | `number`                                    | ~30 000 ms | Request timeout. Omit to use the platform default.           |

## Response shape

### `NetworkResponse`

| Field      | Type                     | Description                                          |
| ---------- | ------------------------ | ---------------------------------------------------- |
| `status`   | `number`                 | HTTP status code.                                    |
| `headers`  | `Record<string, string>` | Lowercased headers; multi-values joined with `", "`. |
| `body`     | `string`                 | Response body decoded as UTF-8 text.                 |
| `finalUrl` | `string`                 | Final URL after redirects (equals `url` if none).    |

## Type links

- [`NetworkService`](/api/types/interfaces/NetworkService)
- [`NetworkRequestOptions`](/api/types/interfaces/NetworkRequestOptions)
- [`NetworkResponse`](/api/types/interfaces/NetworkResponse)

## See also

- [`ctx.ui.openExternal`](/api/ui/) — open a URL in the user's default browser
- [Local Web Viewer](https://github.com/silo-code/silo-extensions/tree/main/local-web-viewer) — example extension using `ctx.net.fetchHeaders`
