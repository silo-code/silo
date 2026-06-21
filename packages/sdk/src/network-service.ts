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
  /** Request body (string). Only meaningful for methods that carry a body. */
  body?: string;
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
   * @throws A string error message if the request fails (network error, DNS
   *   failure, TLS error, etc.).
   *
   * @example
   * ```ts
   * const { status, body } = await ctx.net.fetch("https://api.example.com/data");
   * ```
   */
  fetch(url: string, options?: NetworkRequestOptions): Promise<NetworkResponse>;

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
   * @throws A string error message if the request fails.
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
