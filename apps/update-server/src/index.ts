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

const GOATCOUNTER_URL = "https://silo-updates.goatcounter.com/api/v0/count";
const UPSTREAM_TIMEOUT_MS = 5000;
const CACHE_TTL_SECONDS = 300;

// GoatCounter's server-side bot filter (isbot) rejects any non-browser-shaped
// User-Agent outright — including honest, self-identifying ones ("all bots
// and crawlers that identify themselves as such are ignored" per their own
// FAQ). A generic browser UA is the only value that reliably lands in stats;
// the hit's `path` still makes it obvious in the dashboard what this is.
const BOT_FILTER_SAFE_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface UpdateCheck {
  channel: Channel;
  target: string;
  arch: string;
  version: string;
}

function isChannel(value: string): value is Channel {
  return value === "stable" || value === "nightly";
}

const TOKEN_RE = /^[a-zA-Z0-9._-]+$/;

function parsePath(pathname: string): UpdateCheck | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length !== 4) return null;
  const [channel, target, arch, version] = segments;
  if (!isChannel(channel)) return null;
  if (
    !TOKEN_RE.test(target) ||
    !TOKEN_RE.test(arch) ||
    !TOKEN_RE.test(version)
  ) {
    return null;
  }
  return { channel, target, arch, version };
}

// ADR 0036 — the update-available modal's Install/Skip/Later choice, reported
// alongside the existing update-*check* analytics above. `skipped-version`
// and `skipped-later` stay distinct (not collapsed into one "skipped") so
// permanent opt-out and "ask me next time" stay distinguishable in the data.
type UpdateAction = "installed" | "skipped-version" | "skipped-later";

interface UpdateActionEvent {
  action: UpdateAction;
  channel: Channel;
  version: string;
}

function isUpdateAction(value: string): value is UpdateAction {
  return (
    value === "installed" ||
    value === "skipped-version" ||
    value === "skipped-later"
  );
}

function parseActionPath(pathname: string): UpdateActionEvent | null {
  const segments = pathname.split("/").filter(Boolean);
  // /update-action/<action>/<channel>/<version>
  if (segments.length !== 4 || segments[0] !== "update-action") return null;
  const [, action, channel, version] = segments;
  if (!isUpdateAction(action) || !isChannel(channel)) return null;
  if (!TOKEN_RE.test(version)) return null;
  return { action, channel, version };
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
  if (!env.GOATCOUNTER_TOKEN) {
    console.error("reportUpdateCheck: GOATCOUNTER_TOKEN not set, skipping");
    return;
  }
  try {
    const res = await fetch(GOATCOUNTER_URL, {
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
            user_agent: BOT_FILTER_SAFE_USER_AGENT,
            ip: coarsenIp(rawIp),
          },
        ],
      }),
    });
    if (!res.ok) {
      console.error(
        `reportUpdateCheck: GoatCounter rejected hit: ${res.status} ${await res.text()}`,
      );
    }
  } catch (err) {
    console.error("reportUpdateCheck: request failed", err);
    // Swallowed on purpose — see reliability contract above.
  }
}

/**
 * The update-available modal's Install/Skip/Later choice (ADR 0036), reported
 * to the same `silo-updates` GoatCounter site as update checks — no new site,
 * just a second event path. Never throws — same reliability contract as
 * {@link reportUpdateCheck}.
 */
async function reportUpdateAction(
  env: Env,
  event: UpdateActionEvent,
  rawIp: string | null,
): Promise<void> {
  if (!env.GOATCOUNTER_TOKEN) {
    console.error("reportUpdateAction: GOATCOUNTER_TOKEN not set, skipping");
    return;
  }
  try {
    const res = await fetch(GOATCOUNTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GOATCOUNTER_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        hits: [
          {
            path: `/update-action/${event.action}/${event.channel}/${event.version}`,
            title: `Update action [${event.channel}] ${event.action} ${event.version}`,
            event: true,
            user_agent: BOT_FILTER_SAFE_USER_AGENT,
            ip: coarsenIp(rawIp),
          },
        ],
      }),
    });
    if (!res.ok) {
      console.error(
        `reportUpdateAction: GoatCounter rejected hit: ${res.status} ${await res.text()}`,
      );
    }
  } catch (err) {
    console.error("reportUpdateAction: request failed", err);
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

      if (url.pathname.startsWith("/update-action/")) {
        const event = parseActionPath(url.pathname);
        if (!event) return new Response(null, { status: 404 });
        const rawIp = request.headers.get("CF-Connecting-IP");
        ctx.waitUntil(reportUpdateAction(env, event, rawIp));
        return new Response(null, { status: 204 });
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
