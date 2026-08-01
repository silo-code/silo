/**
 * Proxies Tauri's updater "check for update" request to the real GitHub
 * release manifest, so the check surfaces target/arch/version to GoatCounter
 * without collecting anything else.
 *
 * Reliability contract: the manifest fetch/return path must succeed even if
 * GoatCounter is unreachable or misconfigured — analytics is fire-and-forget
 * (ctx.waitUntil) and can never affect the response. If this worker itself
 * fails outright, it returns a non-2xx/204 status so the Tauri client falls
 * through to the direct GitHub endpoint configured as its second endpoint.
 */

export interface Env {
  GOATCOUNTER_TOKEN: string;
}

const MANIFEST_URLS = {
  stable:
    "https://github.com/silo-code/silo/releases/latest/download/latest.json",
  nightly:
    "https://github.com/silo-code/silo/releases/download/nightly/latest.json",
} as const;

type Channel = keyof typeof MANIFEST_URLS;

const GOATCOUNTER_URL = "https://silo.goatcounter.com/api/v0/count";
const UPSTREAM_TIMEOUT_MS = 5000;
const CACHE_TTL_SECONDS = 300;

interface UpdateCheck {
  channel: Channel;
  target: string;
  arch: string;
  version: string;
}

function isChannel(value: string): value is Channel {
  return value === "stable" || value === "nightly";
}

function parsePath(pathname: string): UpdateCheck | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length !== 4) return null;
  const [channel, target, arch, version] = segments;
  if (!isChannel(channel)) return null;
  const token = /^[a-zA-Z0-9._-]+$/;
  if (!token.test(target) || !token.test(arch) || !token.test(version)) {
    return null;
  }
  return { channel, target, arch, version };
}

/** Zero the parts of the address that identify a specific device, keeping
 * only enough to let GoatCounter's session grouping approximate "how many
 * distinct machines" — the same anonymization GoatCounter applies itself. */
function coarsenIp(ip: string | null): string | undefined {
  if (!ip) return undefined;
  if (ip.includes(":")) {
    const parts = ip.split(":");
    return `${parts.slice(0, 3).join(":")}::`;
  }
  const parts = ip.split(".");
  if (parts.length !== 4) return undefined;
  return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
}

async function fetchManifest(channel: Channel): Promise<Response> {
  const manifestUrl = MANIFEST_URLS[channel];
  const cache = caches.default;
  const cacheKey = new Request(manifestUrl);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const upstream = await fetch(manifestUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "silo-update-server" },
    });
    if (!upstream.ok) {
      return new Response(null, { status: 502 });
    }
    const body = await upstream.text();
    const response = new Response(body, {
      status: upstream.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}`,
      },
    });
    await cache.put(cacheKey, response.clone());
    return response;
  } catch {
    return new Response(null, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}

/** Never throws — analytics failures must not surface to the caller. */
async function reportUpdateCheck(
  env: Env,
  check: UpdateCheck,
  rawIp: string | null,
): Promise<void> {
  if (!env.GOATCOUNTER_TOKEN) return;
  try {
    await fetch(GOATCOUNTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GOATCOUNTER_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        hits: [
          {
            path: `/update-check/${check.channel}/${check.version}/${check.target}-${check.arch}`,
            title: `Update check [${check.channel}] ${check.version} (${check.target}-${check.arch})`,
            event: true,
            user_agent: "Silo-Updater",
            ip: coarsenIp(rawIp),
          },
        ],
      }),
    });
  } catch {
    // Swallowed on purpose — see reliability contract above.
  }
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    try {
      const url = new URL(request.url);

      if (url.pathname === "/health") {
        return new Response("ok", { status: 200 });
      }
      if (request.method !== "GET") {
        return new Response(null, { status: 405 });
      }

      const check = parsePath(url.pathname);
      if (!check) {
        return new Response(null, { status: 404 });
      }

      const manifest = await fetchManifest(check.channel);

      const rawIp = request.headers.get("CF-Connecting-IP");
      ctx.waitUntil(reportUpdateCheck(env, check, rawIp));

      return manifest;
    } catch {
      // Anything unexpected falls back to the direct GitHub endpoint on the
      // Tauri client rather than surfacing a broken response.
      return new Response(null, { status: 502 });
    }
  },
};
