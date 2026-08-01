---
status: accepted
date: 2026-08-01
---

# 0031. Update-check analytics via a Cloudflare Worker proxy

## Context

Silo's updater (`tauri-plugin-updater`) had no telemetry: both `tauri.conf.json`
and `tauri.nightly.conf.json` pointed `updater.endpoints` directly at a static
GitHub release asset (`.../releases/.../download/latest.json`). That gave no
visibility into whether anyone was using the app, which versions/platforms were
actually installed, or how adoption of a new release progressed — GitHub's own
release-asset download counts are aggregate totals only, with no per-version or
per-arch breakdown and no sense of unique installs over time.

The forces:

- **No new repo to operate.** The monorepo (`pnpm-workspace.yaml`: `apps/*`,
  `packages/*`) already has a slot for this; standing up a separate repo just to
  host a few dozen lines of proxy code isn't worth the overhead.
- **Zero tolerance for breaking updates.** The updater is how users get fixes.
  Anything added in front of it must never be a single point of failure.
- **No user tracking.** Users must not be able to feel individually observed —
  no persistent identifiers, no stored IPs, no cookies. "An idea of how many
  people are using this and on what versions" is the whole ask, not "who."
- **Reuse existing infra.** getsilo.dev's DNS already lives in a Cloudflare
  account we control, and GoatCounter (site code `silo`) is already the
  analytics backend for getsilo.dev and extensions.getsilo.dev.

## Decision

Added `apps/update-server`, a small Cloudflare Worker deployed at
`updates.getsilo.dev` (a new subdomain on the existing `getsilo.dev` zone —
the zone's DNS is Cloudflare-managed even though the main site itself is
served by GitHub Pages, so this required no change to the docs site).

The worker:

- Parses `/{channel}/{target}/{arch}/{version}` (`channel` is `stable` or
  `nightly`), proxies the matching upstream GitHub release manifest unchanged,
  and edge-caches it for 5 minutes.
- Reports `channel`/`target`/`arch`/`version` to GoatCounter as a synthetic
  event (`/update-check/<channel>/<version>/<target>-<arch>`), fired via
  `ctx.waitUntil` so it can never block or fail the actual update check.
- Coarsens the connecting IP before handing it to GoatCounter (last octet
  zeroed for IPv4, last 80 bits for IPv6) purely so GoatCounter's own session
  grouping can approximate distinct machines — the worker itself never stores,
  logs, or persists an IP anywhere.
- Fails closed: any internal error or upstream failure returns a non-2xx
  status. Per Tauri's updater contract, a non-2xx/204 response makes the
  client fall through to the next configured endpoint.
- Reports hits with a **generic browser `user_agent` string**, not an honest
  one. GoatCounter's server-side bot filter (`isbot`) rejects _any_
  non-browser-shaped UA — including a self-identifying one like
  `"SiloUpdater/1.0"` — before it ever reaches stats; their own FAQ states
  "all bots and crawlers that identify themselves as such are ignored." A
  hit with a real UA still gets a `202 {"status":"ok"}` from the API, which
  is misleading — it's accepted and then silently discarded, not counted.
  Confirmed by direct testing (2026-08-01): identical hits differing only in
  `user_agent` landed in `/api/v0/stats/hits` with a browser-shaped UA and
  never did with an honest one, even after 5+ minutes (GoatCounter's own docs
  claim 10-second stats latency, so this isn't just processing lag). There is
  no honest UA string that gets past this — the `path` field is what keeps
  this legible in the dashboard despite the fake UA.

Both `tauri.conf.json` and `tauri.nightly.conf.json` list the worker as the
**first** endpoint and the direct GitHub manifest URL as a **second, fallback**
endpoint — if the worker or GoatCounter is ever down, misconfigured, or
deleted outright, updates keep working exactly as before this change, just
without the analytics.

## Consequences

**Easier:**

- We finally have a rough signal for version/platform adoption and usage
  volume, visible in the same GoatCounter dashboard already used for
  getsilo.dev traffic — no new analytics account or dashboard to check.
- Both release channels (stable and nightly) are instrumented the same way,
  distinguished by the `channel` segment.

**Harder:**

- One more small piece of production infrastructure to keep working
  (`updates.getsilo.dev`), deployed independently via `wrangler deploy` from
  `apps/update-server` — not wired into CI/CD, since its logic changes rarely
  (see Alternatives).
- The `GOATCOUNTER_TOKEN` Worker secret needs to be rotated by hand if the
  underlying GoatCounter API token is ever rotated (`~/.config/goatcounter/token`
  is today's source of truth for that value).
- Adding a third release channel means adding an entry to `MANIFEST_URLS` in
  `apps/update-server/src/index.ts` — easy to forget if a future channel's
  `tauri.*.conf.json` isn't cross-checked against this file.

**Neutral / committed to:**

- Update-check volume is a proxy for activity, not a precise unique-install
  count — a user running many sessions looks like many checks. This was a
  deliberate trade against collecting anything closer to a persistent
  per-device identifier.
- The worker never touches the actual update **artifacts** (the signed
  `.tar.gz`/`.msi`/etc. downloads) or the minisign signature verification —
  those still come straight from GitHub Releases, untouched, so this doesn't
  add a new attack surface to the update-integrity chain (the compiled-in
  `pubkey` in each `tauri*.conf.json` verifies the artifact signature
  independent of how the manifest itself was transported).

## Alternatives considered

**A. Self-host the manifest entirely (own release process, not GitHub
Releases).** Rejected — would duplicate the existing GitHub Actions release
pipeline for no benefit; the goal was visibility into an existing flow, not a
new one.

**B. Client-side telemetry SDK in the app.** Rejected outright — the explicit
requirement was to observe **update checks**, not add always-on tracking code
to the app itself. Keeping this entirely server-side (a proxy the client
already talks to for an unrelated reason) means there's no new code path in
Silo itself to reason about or disable.

**C. Git-connected auto-deploy (Cloudflare Workers Builds) instead of manual
`wrangler deploy`.** Deferred, not rejected — this worker's logic is generic
(it doesn't reference specific version numbers and doesn't need touching on
every release), so the CI/CD ceremony wasn't worth it up front. Revisit if the
worker starts changing often.

## References

- `apps/update-server/src/index.ts` — the worker
- `apps/update-server/wrangler.toml` — deploy config (Custom Domain route)
- `apps/desktop/src-tauri/tauri.conf.json` / `tauri.nightly.conf.json` —
  `updater.endpoints`
- ADR 0024 — release channels (stable/nightly), the split this builds on
