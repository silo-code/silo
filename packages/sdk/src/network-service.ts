/**
 * Thrown by {@link NetworkService.fetch} and {@link NetworkService.fetchHeaders}
 * when a request fails (network error, DNS failure, TLS error, timeout, etc.).
 *
 * ```ts
 * try {
 *   const res = await ctx.net.fetch("https://api.example.com/data");
 * } catch (err) {
 *   if (err instanceof NetworkError) {
 *     console.error(`Request to ${err.url} failed: ${err.message}`);
 *   }
 * }
 * ```
 *
 * @category Core Types
 * @public
 */
export class NetworkError extends Error {
  /** The URL that was requested when the error occurred. */
  readonly url: string;

  constructor(url: string, message: string) {
    super(message);
    this.name = "NetworkError";
    this.url = url;
    // Restore the prototype chain so `instanceof` works across the down-leveled
    // class output the SDK ships (and across the host↔extension boundary, where
    // there's a single shared SDK instance).
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

/**
 * Options for {@link NetworkService.fetch} and {@link NetworkService.fetchHeaders}.
 *
 * @category Core Types
 * @public
 */
export interface NetworkRequestOptions {
  /**
   * HTTP method. Defaults to `"GET"` for {@link NetworkService.fetch} and
   * `"HEAD"` for {@link NetworkService.fetchHeaders}.
   */
  method?: "GET" | "HEAD" | "POST" | "PUT" | "DELETE" | "PATCH";
  /** Request headers to send. */
  headers?: Record<string, string>;
  /**
   * Request body. A string is sent as-is; an `ArrayBuffer` / `Uint8Array` is
   * sent as raw bytes (e.g. uploading a file). Only meaningful for methods that
   * carry a body.
   */
  body?: string | ArrayBuffer | Uint8Array;
  /** Follow HTTP redirects. Defaults to `true`. */
  followRedirects?: boolean;
  /** Request timeout in milliseconds. Omit for the platform default (~30 s). */
  timeoutMs?: number;
}

/**
 * Response from {@link NetworkService.fetch}.
 *
 * @category Core Types
 * @public
 */
export interface NetworkResponse {
  /** HTTP status code. */
  status: number;
  /**
   * Response headers, lowercased. Multi-value headers are joined with `", "`,
   * matching the HTTP/1.1 field-value combining rule.
   */
  headers: Record<string, string>;
  /** Response body decoded as UTF-8 text. */
  body: string;
  /** Final URL after redirects. */
  finalUrl: string;
}

/**
 * Response from {@link NetworkService.fetchBytes} — identical to
 * {@link NetworkResponse} but with the body delivered as raw bytes.
 *
 * @category Core Types
 * @public
 */
export interface NetworkBytesResponse {
  /** HTTP status code. */
  status: number;
  /** Response headers, lowercased (multi-value joined with `", "`). */
  headers: Record<string, string>;
  /** Response body as raw bytes. */
  body: ArrayBuffer;
  /** Final URL after redirects. */
  finalUrl: string;
}

/**
 * Server-side HTTP client exposed as {@link ExtensionContext.net}. Requests
 * run in the Rust backend via `reqwest`, so they bypass the browser's CORS
 * policy and can read response headers that the browser would otherwise hide
 * from cross-origin requests.
 *
 * Typical use-cases:
 * - Checking `X-Frame-Options` / CSP `frame-ancestors` before embedding a URL
 *   in an `<iframe>` (see the Web Viewer extension).
 * - Probing a `localhost` dev server that has no CORS headers.
 * - Fetching data from an external API that doesn't grant cross-origin access.
 *
 * @category Consumer Services
 * @public
 */
export interface NetworkService {
  /**
   * Make an HTTP request server-side, bypassing CORS. Returns the full
   * response: status, headers, body, and the final URL after any redirects.
   *
   * @param url - The URL to fetch.
   * @param options - Method, headers, body, redirect and timeout controls.
   * @throws {@link NetworkError} if the request fails (network error, DNS
   *   failure, TLS error, etc.).
   *
   * @example
   * ```ts
   * const { status, body } = await ctx.net.fetch("https://api.example.com/data");
   * ```
   */
  fetch(url: string, options?: NetworkRequestOptions): Promise<NetworkResponse>;

  /**
   * Like {@link NetworkService.fetch}, but resolves the response body as raw
   * bytes ({@link NetworkBytesResponse}) instead of decoding it as UTF-8 text —
   * for downloading images, archives, or any binary payload.
   *
   * @param url - The URL to fetch.
   * @param options - Method, headers, body, redirect and timeout controls. The
   *   body may itself be binary (`ArrayBuffer` / `Uint8Array`).
   * @throws {@link NetworkError} if the request fails.
   *
   * @remarks
   * The body rides Tauri's binary IPC channel (no base64), but the whole
   * response is still buffered in memory on both sides — suitable for typical
   * asset downloads (up to a few tens of MB), not for streaming multi-hundred-MB
   * files.
   *
   * @example
   * ```ts
   * const { body } = await ctx.net.fetchBytes("https://example.com/logo.png");
   * await ctx.files.writeBytes("logo.png", body);
   * ```
   */
  fetchBytes(
    url: string,
    options?: NetworkRequestOptions,
  ): Promise<NetworkBytesResponse>;

  /**
   * Send a `HEAD` request and return only the response headers — no body is
   * downloaded. More efficient than {@link NetworkService.fetch} when you only
   * need to inspect headers (e.g. checking embeddability before loading an
   * iframe).
   *
   * Header names are lowercased; multi-value headers are joined with `", "`.
   *
   * @param url - The URL to probe.
   * @param options - Redirect and timeout controls (`method` and `body` are
   *   ignored — this is always a HEAD request).
   * @throws {@link NetworkError} if the request fails.
   *
   * @example
   * ```ts
   * const headers = await ctx.net.fetchHeaders("https://github.com");
   * const blocked = headers["x-frame-options"] === "deny";
   * ```
   */
  fetchHeaders(
    url: string,
    options?: Pick<NetworkRequestOptions, "followRedirects" | "timeoutMs">,
  ): Promise<Record<string, string>>;
}
