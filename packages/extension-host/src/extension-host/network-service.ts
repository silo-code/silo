import { invoke } from "@tauri-apps/api/core";
import type {
  NetworkService,
  NetworkRequestOptions,
  NetworkResponse,
} from "@silo-code/sdk";
import { NetworkError } from "@silo-code/sdk";

// `ctx.net` — server-side HTTP client. Requests run in the Rust backend via
// reqwest, so they bypass browser CORS and can read any response header.
// The public contract lives in @silo-code/sdk (network-service.ts).

let service: NetworkService | null = null;

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
        body: options?.body,
        followRedirects: options?.followRedirects,
        timeoutMs: options?.timeoutMs,
      }).catch((err: unknown) => {
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
