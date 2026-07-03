import { invoke } from "@tauri-apps/api/core";
import type {
  NetworkService,
  NetworkRequestOptions,
  NetworkResponse,
  NetworkBytesResponse,
} from "@silo-code/sdk";
import { NetworkError } from "@silo-code/sdk";

// `ctx.net` — server-side HTTP client. Requests run in the Rust backend via
// reqwest, so they bypass browser CORS and can read any response header.
// The public contract lives in @silo-code/sdk (network-service.ts).

let service: NetworkService | null = null;

/**
 * Split the request `body` into the two params the Rust commands accept: a
 * UTF-8 `body` string or a binary `bodyBytes` number array (sent over JSON IPC,
 * matching `fs_write_bytes` / `terminal_write`). Exactly one is set.
 */
function encodeBody(body: NetworkRequestOptions["body"]): {
  body?: string;
  bodyBytes?: number[];
} {
  if (body === undefined) return {};
  if (typeof body === "string") return { body };
  const bytes = body instanceof Uint8Array ? body : new Uint8Array(body);
  return { bodyBytes: Array.from(bytes) };
}

/**
 * Decode the `[u32 LE meta length][meta JSON][raw body bytes]` frame produced
 * by the `net_fetch_bytes` Rust command back into a {@link NetworkBytesResponse}.
 */
function decodeBytesFrame(framed: ArrayBuffer): NetworkBytesResponse {
  const metaLen = new DataView(framed).getUint32(0, true);
  const meta = JSON.parse(
    new TextDecoder().decode(new Uint8Array(framed, 4, metaLen)),
  ) as Pick<NetworkBytesResponse, "status" | "headers" | "finalUrl">;
  return {
    status: meta.status,
    headers: meta.headers,
    finalUrl: meta.finalUrl,
    body: framed.slice(4 + metaLen),
  };
}

export function getNetworkService(): NetworkService {
  if (service) return service;
  service = {
    fetch(
      url: string,
      options?: NetworkRequestOptions,
    ): Promise<NetworkResponse> {
      return invoke<NetworkResponse>("net_fetch", {
        url,
        method: options?.method,
        headers: options?.headers,
        ...encodeBody(options?.body),
        followRedirects: options?.followRedirects,
        timeoutMs: options?.timeoutMs,
      }).catch((err: unknown) => {
        throw new NetworkError(url, String(err));
      });
    },
    fetchBytes(
      url: string,
      options?: NetworkRequestOptions,
    ): Promise<NetworkBytesResponse> {
      return invoke<ArrayBuffer>("net_fetch_bytes", {
        url,
        method: options?.method,
        headers: options?.headers,
        ...encodeBody(options?.body),
        followRedirects: options?.followRedirects,
        timeoutMs: options?.timeoutMs,
      })
        .then(decodeBytesFrame)
        .catch((err: unknown) => {
          throw new NetworkError(url, String(err));
        });
    },
    fetchHeaders(
      url: string,
      options?: Pick<NetworkRequestOptions, "followRedirects" | "timeoutMs">,
    ): Promise<Record<string, string>> {
      return invoke<Record<string, string>>("net_fetch_headers", {
        url,
        followRedirects: options?.followRedirects,
        timeoutMs: options?.timeoutMs,
      }).catch((err: unknown) => {
        throw new NetworkError(url, String(err));
      });
    },
  };
  return service;
}
