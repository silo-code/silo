---
status: implemented
created: 2026-07-12
---

# 0014. Extension registry — central publishing, discovery, and install

> **Implemented.** The registry shipped end to end as designed: publishers cut a
> GitHub Release on their own repo, a git-backed robot validates each version and
> pins its sha256 into a static index served from `registry.getsilo.dev`, and both
> [extensions.getsilo.dev](https://extensions.getsilo.dev) and in-app **Browse /
> install / update** are pure readers of it. The catalog itself lives in the
> external `silo-code/extensions-registry` repo — see
> [`docs/extensions-registry-repo.md`](../extensions-registry-repo.md). **Private
> / team registries (a federated index)** were designed here but not built, and
> remain `planned`.

## Summary

A central extension registry for Silo with a catalog website and first-class
in-app browse/install/update. Publishers ship by **cutting a GitHub Release on
their own repo**; a git-backed robot validates each version, pins its sha256,
and compiles a **static `index.json`** served from `registry.getsilo.dev`; the
website (`extensions.getsilo.dev`) and the app are pure **readers** of that
index. No servers, no database, no registry accounts: identity is GitHub repo
control, integrity is a digest pin verified at install, revocation is an
advisories feed. The index schema is an **open contract**, so private/team
registries are just other URLs serving the same format. The registry becomes
the **primary** install/browse/update UX in Silo; folder/URL/npm sideloading
([RFC 0008](./0008-extension-package-format-remote-install.md)) remain
supported forever as secondary paths.

## Motivation

Distribution today ends at a README table. The install pipeline is done —
folder, tarball URL, and npm installs are stable, `installed.json` records
provenance, permissions are consented at install — but there is no way to
**discover** extensions, no **update detection**, no **revocation** path if a
published extension turns out to be malicious, and no **identity** story
stronger than "whoever controls this URL." RFC 0008 froze the package format
and reserved marketplace metadata; this RFC designs the marketplace itself.

The strategic reason to do it well: **traction**. Ecosystems grow where
publishing and installing are frictionless (npm, Obsidian, Raycast). The
easier both sides are, the more extensions exist, and the more the extension
system pays for itself.

## The seamlessness bar

These are **requirements** the design is measured against, not aspirations:

- **Publisher, steady state:** `git tag v0.2.0 && git push --tags` → live on
  the website in ~2 minutes, with the URL printed in the workflow log.
  Nothing else.
- **Publisher, first publish:** **one gesture** — `silo-ext publish` (or the
  website's "Publish your extension" flow) handles registration and first
  release together. `create-silo-extension` scaffolds the publish workflow by
  default, so every new extension is publish-ready from minute one.
- **Consumer:** find an extension anywhere — in-app Browse, the website, or an
  agent — then one click → permission-consent modal → running. The website is
  never a dead end: an **Install in Silo** deep link opens the in-app detail
  view. Updates are a badge plus "Update" / "Update all."

## Design

### Shape

```
publisher repo (acme/silo-weather)
  └─ GitHub Release: v0.2.0 + silo-weather-0.2.0.tgz + provenance attestation
        │  ① ingest (GitHub Action in silo-code/extensions-registry;
        │     cron in P1, release-webhook-triggered in P2)
        ▼
silo-code/extensions-registry        ← the registry IS this repo
  ├─ extensions/<id>.json               registrations (bot-validated, auto-merged)
  ├─ versions/<id>.json                 append-only version log (CI-written only)
  ├─ advisories.json                    kill-switch feed
  └─ CI: validate → sha256 pin → extract README → compile index → deploy
        │  ② GitHub Pages
        ▼
registry.getsilo.dev                 ← static JSON, CORS-open; git history = audit log
  ├─ index.json                         the whole catalog, one file
  ├─ ext/<id>.json                      full per-extension record
  ├─ readme/<id>.md                     version-pinned READMEs
  └─ llms.txt                           agent-readable surface
        │  ③ readers
        ▼
extensions.getsilo.dev (static site)     Silo app (Browse tab, updates, CLI)
```

Three properties fall out of this shape:

- **The registry is data, not a service.** The only writer is CI; every write
  is a commit. There is no request-time compute anywhere.
- **We index and verify; publishers host.** Tarballs stay on each publisher's
  GitHub Releases — no upload API, no publisher tokens, no storage bill.
- **The digest pin closes the pointer-registry hole.** The index records each
  tarball's sha256 at ingest and the app verifies it before install, so an
  asset silently swapped behind an existing version fails everywhere.

### The index contract

The schema is the public API of the registry — versioned, documented, and the
thing private registries implement. Records (illustrative fields, frozen
during P1 implementation):

```jsonc
// extensions/acme.weather.json — registration (one per extension, ever)
{
  "id": "acme.weather",             // <publisher>.<name>; publisher == GitHub owner
  "repo": "acme/silo-weather",      // the bound repo; several ids may share one repo
  "description": "Weather in your status bar",
  "categories": ["status-bar"],
  "addedAt": "2026-07-12"
}

// versions/acme.weather.json — append-only, CI-written only
{
  "versions": [{
    "version": "0.2.0",
    "tarballUrl": "https://github.com/acme/silo-weather/releases/download/v0.2.0/silo-weather-0.2.0.tgz",
    "mirrorUrl": null,              // P2: R2 fallback copy
    "sha256": "9f2a…",
    "size": 48123,
    "engine": "^0.17.0",
    "permissions": ["network"],
    "permissionsWidened": false,    // vs previous version — surfaced by UIs
    "provenance": "attested",       // "attested" | "none"
    "publishedAt": "2026-07-12T18:04:00Z",
    "downloads": 0,                 // GitHub asset download_count, refreshed at ingest
    "yanked": null                  // { at, reason } — blocks new installs only
  }]
}

// advisories.json — the kill switch
{ "advisories": [{
    "id": "acme.weather", "versions": "<0.2.1", "severity": "critical",
    "reason": "exfiltrates ~/.ssh", "action": "disable",   // "warn" | "disable"
    "createdAt": "…"
}]}
```

CI compiles these into `index.json` (per-extension summary: latest compatible
version, search fields, status, badges) plus `ext/<id>.json` (full history)
and `readme/<id>.md` (extracted from the tarball at ingest — version-pinned,
survives repo deletion, agent-readable). `homepage` / `repository` from the
package's `package.json` are carried through as link fields.

### Registration and namespace policy

The canonical act of registration is **one JSON file landing in the registry
repo**, bot-validated and **auto-merged** when checks pass. No human gate;
humans handle only disputes, transfers, and advisories.

The one hard rule — the entire identity and anti-squatting story:

> **`id` must be `<publisher>.<name>` where `publisher` equals the GitHub
> owner of the bound repo** (case-insensitive). Registering `microsoft.foo`
> requires controlling `github.com/microsoft`.

Reserved namespaces (`silo`, `silo-code`, `core`) map to the `silo-code` org
— which also grandfathers the existing `silo.*` extensions in
[`silo-extensions`](../silo-extensions-repo.md). Renames/transfers are edits
to the `repo` binding, human-reviewed.

Developer-facing registration UX, in layers:

1. **P1:** a "Publish your extension" form page on the website that deep-links
   to GitHub's pre-filled create-file/propose flow
   (`…/new/main?filename=extensions/<id>.json&value=…`). Zero infra; the
   publisher never writes JSON or opens a PR by hand, and the bot merges
   within a minute.
2. **P2:** true web registration — "Sign in with GitHub" via a small
   Cloudflare Worker + GitHub App that verifies repo ownership from the OAuth
   identity, prefills/validates the manifest from the repo, and commits the
   registration directly. First running service and first stored secret in
   the system; also the future home for report-abuse and transfer forms.
3. **Noted, not planned:** registration-less discovery via a `silo-extension`
   repo topic (publishing _is_ registering). Deferred — an explicit opt-in
   gesture is worth keeping while extensions run unsandboxed.

### Ingestion

A GitHub Actions workflow in the registry repo — **cron (~30 min) +
`workflow_dispatch` in P1; triggered within seconds by release webhooks in P2**
(the cron demotes to a backup sweep). Per registered extension it:

1. Lists GitHub Releases on the bound repo (`v*` tags for single-extension
   repos; `<name>@v*` for multi-extension repos like `silo-extensions`).
2. For each new version: downloads the `.tgz`, validates the manifest against
   the same rules the app enforces (`silo.id` matches the registration,
   `permissions ⊆ KNOWN_PERMISSIONS`, `main` path rules, size cap), and
   computes the sha256.
3. Verifies the provenance attestation if present (`gh attestation verify`)
   → `provenance: "attested"`.
4. Flags permission widening vs the previous version; extracts the README;
   refreshes download counts.
5. Commits the version record and redeploys the index. A re-tagged release
   whose digest differs from an already-recorded version is **rejected and
   flagged**, never overwritten.

### Artifact hosting and integrity

Artifacts live on **publishers' GitHub Releases, pinned by digest** — not on
registry-owned storage. Why this wins:

- **Cost/ops:** no upload API means no publisher auth against the registry,
  no token issuance, no abuse surface. The write path — the most expensive
  component of every marketplace design — doesn't exist.
- **Integrity:** the classic objection (publisher swaps the asset behind a
  version) is neutralized by the ingest-time sha256 pin + install-time
  verification. Version records are append-only.

Failure modes and mitigations:

- **Publisher deletes the release/repo** → new installs of that version break
  (already-installed copies are local and unaffected). Mitigation (P2): the
  ingest job mirrors verified tarballs to **Cloudflare R2** (zero egress
  fees); the index serves `mirrorUrl` as fallback. Purely additive. Mirrored
  copies are purged on legal takedown, since at that point we are hosting.
- **Rate limits** → release-asset downloads are direct CDN URLs, not API
  calls; ingest uses an authenticated token (5k req/h). Non-issue at this
  scale.
- **Private repos** → public listings require public repos (assets must be
  anonymously fetchable). Private distribution is the federated model below.

### Availability detection

The ingest pass (or a daily health sweep) also detects extensions that "go
away": the bound repo 404s/goes private, or pinned tarball URLs stop
resolving (`HEAD` checks). Results are **state in the index**, not just logs:
per-extension `status: "active" | "unavailable" | "removed"` +
`unavailableSince`, per-version flags. Policy: first failure marks
`unavailable` (website banner, search deprioritized, install warned); after a
~30-day grace period without recovery, `removed` (delisted from search).
Installed copies keep working either way — the app's update checker surfaces
"no longer available upstream" as information, not a disable (disappearance
isn't malice; that's what advisories are for). GitHub renames redirect URLs
but break the id-prefix==owner binding, so the health check re-verifies the
binding and routes renames through the transfer flow. With the P2 mirror,
disappearance degrades from broken installs to a metadata footnote.

### Security model — distribution trust, not execution trust

This RFC **amends the gating in [RFC 0006](./0006-extension-permissions-sandbox.md)**:
the sandbox (0006 phase 3) is no longer the gate for the marketplace — it is
future hardening on its own track, built when there's real need. The registry
launches with **fully automated publishing** and compensating controls:

- **Identity binding** — the namespace rule above; you publish as who you are
  on GitHub, nothing else.
- **Integrity** — sha256 pinned at ingest, verified by the app before
  install; append-only version records.
- **Provenance** — publishers using the CI path get a sigstore attestation
  (`actions/attest-build-provenance`) binding artifact ↔ repo + commit +
  workflow → a **"verified build"** badge. Unattested versions publish fine,
  just unbadged.
- **Consent** (shipped) — the permission modal at install; re-consent when an
  update widens permissions; `permissionsWidened` flagged in the index.
- **Revocation** — `advisories.json`, polled alongside update checks.
  `warn` banners the extension; `disable` deactivates it on next launch with
  an explanatory notice. `yanked` blocks new installs of a version without
  touching existing ones. Runbook: a maintainer commits an advisory directly
  (no PR), postmortem lands in the record; the report path is an issue
  template on the registry repo.

What this does **not** claim: extensions still run unsandboxed full-JS in the
host realm — RFC 0006's threat model stands unchanged, and the registry
provides _distribution_ trust (who published it, that it wasn't tampered
with, that it can be revoked), not _execution_ trust. "Install extensions you
trust" stays in the install UX and on every detail page. Registry-sourced
extensions remain in the existing third-party tier
([ADR 0013](../decisions/0013-trust-tiers-two-barrel-sdk.md)) with
workspace-scoped `ctx` ([ADR 0015](../decisions/0015-phased-security-model.md)).

### Publish flow

- **CI path (primary):** a reusable action `silo-code/publish-extension-action`
  — on tag: build + `pack` → create the GitHub Release with the `.tgz`
  attached → attest provenance → print the registry URL. The scaffolder ships
  this workflow by default, making steady-state publishing exactly
  `git tag && git push --tags`.
- **CLI path:** `silo-ext publish` in `@silo-code/extension-tools`
  ([RFC 0007](./0007-extension-authoring-toolchain.md)'s CLI —
  `create-silo-extension` stays a scaffolder). Pack → create release + upload
  via the user's `gh` auth → if unregistered, complete registration in the
  same run (open the pre-filled flow in P1; call the web-registration flow in
  P2). Laptop publishes don't get attestation — the badge is CI-only.
- **Auth:** GitHub-native only. The registry itself has zero accounts.
- **Watch-item (not solved here):** third-party publishers build against the
  **npm-published** `@silo-code/sdk`, so SDK release cadence becomes a
  publisher-experience constraint once outsiders depend on it.

### Website — `extensions.getsilo.dev`

A separate static app (Astro, static output, Cloudflare Pages free tier) —
`getsilo.dev` root remains the docs site. Pages are generated from
`index.json` at build time: SEO-able per-extension detail pages (rendered
README, permissions, provenance badge, versions, downloads, install command)
plus client-side search (minisearch — fine into the hundreds of extensions).
Registry CI hits a Pages deploy hook after each index change (debounced: one
rebuild per ingest batch). Every detail page has an **Install in Silo**
button — a `silo://extension/<id>` deep link (Tauri deep-link handler, P2)
that opens the in-app detail view with consent ready; the fallback shows
`silo install <id>`.

### App surface — registry as the primary UX

**The registry becomes the primary install/browse/update experience in Silo;
direct URL and file-path installs become secondary** — still supported
forever, but moved to an overflow "Install from URL or file…" action and the
`silo install <path|url>` CLI forms.

- **Extensions page** (`packages/extensions-core/src/extensions/ExtensionsPage.tsx`):
  opens onto registry **Browse** (search box, categories, featured/popular
  from download counts, one-click install → the existing `previewInstall`
  consent modal); **Installed** is the second view; update badges and
  advisory banners surface at page level.
- **Detail drill-in** (both views): name/publisher/version/description,
  permissions, provenance badge, source, links, and the **rendered README**
  — installed extensions read `~/.config/silo/extensions/<id>/README.md`
  (npm pack always includes it), browse entries fetch
  `registry.getsilo.dev/readme/<id>.md`; reuse the existing markdown
  rendering path (the page is core-tier). The detail view is also the surface
  for the update button + permission diff, advisories, and
  "unavailable upstream" notices.
- **`ExtensionManager`** (`packages/extension-host/src/extension-host/extension-manager.ts`):
  `installFromRegistry(id, version?)` — resolve against configured registries
  → the existing `installFromUrl` path with a new expected-digest option;
  `source: "registry"` (+ registry URL, version) in `installed.json`
  (extends [ADR 0022](../decisions/0022-on-disk-storage-layout.md)
  provenance); `checkUpdates()` + advisory polling.
- **Updates:** detection is an ETag-conditional fetch of `index.json` on
  launch + every few hours (steady state ≈ zero-byte 304s), diffed against
  installed registry-sourced versions, offering only the newest
  **engine-compatible**, non-yanked version. npm-sourced installs re-resolve
  via the existing path; folder/URL stay manual. UX: badge + per-extension
  **Update** and **Update all**; each update reuses the shipped
  stage-validate-swap + rollback, silent when permissions are unchanged,
  consent modal with the permission diff when widened (`updateNeedsConsent`,
  shipped) — "Update all" applies clean ones immediately and queues
  consent-needed ones. Dock-panel extensions may end with "reload to apply"
  (the known `needsReload` limitation). Later opt-in `extensions.autoUpdate`
  applies only digest-verified, attested, non-widening updates.
- **CLI:** `silo install <id>` becomes the canonical form (registry
  resolution when the argument isn't a path/URL); `silo search <term>`;
  `silo registry add|list|remove`.
- **`silo-extensions` repo** becomes the first publisher (adopts the publish
  action + attestation); its README table is replaced by a registry link.

### Federated registries — private extensions and groups

**Any URL serving a conforming `index.json` is a registry.** The app and CLI
support multiple registries: the official one is baked in; users add
`{ name, url, headers? }` in settings (`headers` carries a PAT for private
hosting). `silo-ext index <dir>` generates an index + version records from a
folder of tarballs (à la `helm repo index`) — host it on a private repo raw
URL, an internal server, or a `file:` path.

- **Private publishing MVP:** run `silo-ext index`, push to a private repo,
  `silo registry add <url>`. Zero central infra, zero accounts, works
  air-gapped — on-brand for a local-first editor.
- **Groups:** a shared team registry — the official repo's ingest workflow is
  reusable as a template, so a team can run the same release-driven pipeline
  against their own repos, plus auth headers on the consuming side. If real
  ACL demand appears much later, that's the first moment a Worker + database
  is justifiable — explicitly out of scope now.
- **Naming:** a private index is "**a silo**" ("publish to your team's
  silo"); the flagship stays the **Silo Extension Registry**. In code and
  schema the term remains `registry`.

Sideloading (folder / URL / npm) is unaffected and permanent.

### The agent-native registry

Silo's positioning is driving coding agents in the foreground; this registry
is designed to be **read and operated by agents**, which no incumbent
marketplace is:

1. **Agent-readable surface:** `llms.txt` + stable per-extension markdown
   URLs (joining the docs' existing Context7 indexing).
2. **Capability metadata:** index entries carry structured `contributes`
   data (commands, panels, MCP tools an extension registers) so an agent can
   reason about _what capability_ an install adds, not just its description.
3. **MCP tools with no server:** `search_extensions` / `get_extension` /
   `install_extension`, shipped inside Silo (reading the static index,
   calling the local install pipeline). Agent-initiated installs always
   route through the human consent modal — **agents can shop; only humans
   can sign.** That is simultaneously the safety story and the demo: "the
   agent noticed you need Prettier support, found the extension, and is
   asking you to approve its permissions."
4. **"Agent tools" facet** — extensions contributing agent capabilities get a
   first-class category and search filter.

### Costs

| Phase | Infra                                                                                                                                                | $/month                                                                             |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| P1    | GitHub Actions/Pages (free, public repos; Pages ~100 GB/mo soft cap) + Cloudflare Pages free (unlimited bandwidth, 500 builds/mo → debounced)        | **$0** (domain already owned, ~$12/yr)                                              |
| P2    | Worker free tier (100k req/day vs dozens/day expected), GitHub App + sigstore free, R2 free to 10 GB ≈ 10k tarballs (zero egress; then $0.015/GB-mo) | **$0**; first plausible charge = Workers Paid **$5/mo** if free limits are outgrown |
| P3    | Federated — teams host their own indexes                                                                                                             | **$0** to us                                                                        |
| P4    | MCP runs in-app; llms.txt is static                                                                                                                  | **$0**                                                                              |

Scale check: the hot object is `index.json` polling, which is ETag 304s ≈
zero bytes; if the GH Pages cap ever bites, front it with Cloudflare (free).
Worst realistic case at meaningful scale: **<$10/mo**, vs ~$50–200/mo minimum
for the rejected self-hosted-uploads design. No secrets are stored anywhere
in the system until the P2 GitHub App key.

### Phasing

- **P1 — Core registry (correct, not yet instant):** registry repo
  (registrations + auto-merge bot, version logs, ingest cron with validation
  / sha256 pinning / README extraction, index build) → `registry.getsilo.dev`;
  `publish-extension-action` (pack, release, attest); form-based registration
  page; Astro website (search, detail pages); app: `installFromRegistry` +
  digest verification, Browse as the default Extensions view, detail
  drill-in, `silo install <id>`, update detection + Update/Update all with
  permission-diff re-consent.
- **P2 — Seamlessness (the traction phase):** Cloudflare Worker + GitHub App
  = web registration ("Sign in with GitHub", pick repo, done) **and** release
  webhooks for instant ingest (tag → live ≤2 min; cron becomes the backup
  sweep); `silo-ext publish` with auto-registration on first publish;
  scaffolder ships the publish workflow by default; website "Install in
  Silo" deep link + `silo://` handler; advisories + disable-on-advisory;
  attestation verification + verified-build badges; availability detection;
  R2 mirror.
- **P3 — Private + groups ("silos"):** multi-registry settings, `silo
registry add|list|remove`, `silo-ext index <dir>`, private-registry guide +
  team template, auth headers.
- **P4 — Agent-native:** `llms.txt` + per-extension markdown, structured
  `contributes` in the index, built-in MCP tools, agent-tools facet.

The sandbox ([RFC 0006](./0006-extension-permissions-sandbox.md) phase 3) is
**not a dependency of any phase**.

## Alternatives considered

- **Self-hosted artifacts (upload API + R2/S3)** — full control of
  availability, but requires the authenticated write path: publisher
  accounts/tokens, abuse handling, always-on compute. The digest pin gets
  pointer-hosting to the same integrity with none of that; the R2 _mirror_
  recovers the availability benefit additively.
- **npm as the registry** (install by npm tag/keyword) — already supported as
  a channel, but no curationless-identity binding (npm names are
  first-come), no Silo-specific metadata/validation, no revocation, and
  discovery UX we don't control.
- **Zed-style monorepo/submodule registry** — every publish is a PR to our
  repo; heavy for publishers and for us; centralizes hosting we don't want.
- **Raycast-style human review of every submission** — highest curation,
  unbounded maintainer cost; rejected in favor of automated publish +
  compensating controls (identity binding, pinning, provenance, advisories).
- **Accounts + ACLs for private extensions** — real infrastructure and a
  credential store for a need the federated index model serves with zero
  central involvement.
- **Waiting for the sandbox before any marketplace** — safest, but blocks the
  ecosystem indefinitely on work with no current driver; Obsidian ran a
  curated-not-sandboxed directory for years. Revisit hardening when
  scale/incidents demand it.

## Open questions

- Freeze the exact index/record field set during P1 implementation (this RFC
  fixes the shape, not every field name).
- Size cap and any static checks worth running at ingest beyond manifest
  validation (honesty: static scanning of minified bundles is weak — the real
  controls are identity, pinning, provenance, revocation).
- Whether the R2 mirror moves into P1 (zero-broken-installs from day one) at
  the cost of early Cloudflare setup.
- `silo://` deep-link scheme naming and its interaction with workspace state.

## Decision

Draft — pending review.

## References

- [RFC 0006](./0006-extension-permissions-sandbox.md) (threat model; sandbox
  gating amended by this RFC), [RFC 0007](./0007-extension-authoring-toolchain.md)
  (`silo-ext` CLI home), [RFC 0008](./0008-extension-package-format-remote-install.md)
  (package format, remote install, reserved marketplace metadata).
- [ADR 0013](../decisions/0013-trust-tiers-two-barrel-sdk.md),
  [ADR 0015](../decisions/0015-phased-security-model.md),
  [ADR 0019](../decisions/0019-runtime-extension-loading.md),
  [ADR 0022](../decisions/0022-on-disk-storage-layout.md).
- Prior art: Obsidian community plugins (PR-gated JSON registry + publisher
  GitHub Releases), Zed extensions (submodule registry + S3), Raycast store
  (human review), JSR / npm trusted publishing (OIDC provenance), Homebrew
  taps (federated indexes).
