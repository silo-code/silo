---
status: accepted
date: 2026-07-01
---

# 0024. Two release channels: stable and nightly

## Context

Silo previously had one release channel: stable builds triggered by versioned
`silo-v*` tags via release-please. There was no way to ship code to early
testers without going through the full stable release cycle, which made it hard
to get feedback on in-progress work or let developers opt in to bleeding-edge
builds.

The forces:

- **Production safety**: stable users must never be affected by an in-progress
  build. An unstable nightly must not corrupt a stable install's workspaces,
  terminal sessions, or extension state.
- **Coexistence**: both channels must install and run on the same machine
  simultaneously without conflicting — different app identity, different data
  directories, different updater feeds.
- **Minimal divergence**: the nightly channel should build from the same
  codebase with as little variation as possible, to keep the two channels
  comparable and avoid "works in nightly, breaks in stable" surprises.
- **No new secrets**: the nightly build should reuse existing CI secrets (same
  Apple signing identity, same minisign key) rather than requiring a separate
  certificate chain.

## Decision

We ship a second application, **Silo Nightly**, built from the same codebase
as stable Silo using a Tauri config overlay (`tauri.nightly.conf.json`). The
overlay sets a different `productName` ("Silo Nightly"), a different `identifier`
("com.silo.desktop.nightly"), and a different updater endpoint. All other config
— signing keys, bundle metadata, build flags — is inherited from `tauri.conf.json`.

The nightly GitHub Release is pinned to a fixed `nightly` tag and overwritten
on every build. Version strings are auto-generated (`0.x.y-nightly.YYYYMMDD.HASH`)
so they're never mistaken for stable releases. A daily GitHub Actions cron
(`release-nightly.yml`) drives the build; `release-please` is not involved.

We also add a `SILO_CONFIG_DIR` env-var escape hatch: if set, both channels
redirect their user-config root (workspaces, themes, keybindings) to the given
path. This lets developers who switch between channels opt in to sharing their
workspace list without having to recreate workspaces in nightly. Off by default
— stable and nightly are fully isolated unless the user sets the var explicitly.

## Consequences

**Easier:**

- Contributors and early adopters can run nightly builds without affecting their
  stable install.
- The nightly channel provides a real pre-release feedback loop without the
  overhead of a full release-please cycle.

**Harder:**

- Nightly builds accumulate on the `nightly` release tag; the CI prepare job
  clears old assets before each build so the release stays clean.
- The orange nightly icon (distinguishing it visually in the Dock) is not yet
  created — nightly currently shows the same icon as stable, which the user
  must rely on the window title ("Silo Nightly") to distinguish. The icon is a
  design asset to be added as a follow-up.

**Neutral / committed to:**

- The `SILO_PTY_NS` logic in `lib.rs` was generalized from a hardcoded `.dev`
  check to a suffix-based rule (`com.silo.desktop.<ns>`) so every identity
  variant gets its own PTY socket namespace automatically.
- The nightly and stable update feeds are independent; a user on nightly will
  never accidentally receive a stable update.

## Alternatives considered

**A. Single app, selectable channel (Tauri updater channels):** Tauri's updater
supports runtime channel switching via endpoint headers. Rejected: both channels
share one app identity, so their data dirs collide by default. Nightly writes to
stable's workspace files, which creates cross-contamination risk when nightly
ships a schema change.

**B. Default nightly to stable's config dir (always shared):** Simpler UX —
users don't need to know about `SILO_CONFIG_DIR`. Rejected: a nightly build that
ships a workspace-schema migration would silently upgrade the stable config dir,
potentially breaking stable for anyone who runs nightly once.

**C. In-app "import workspaces from stable" button:** Better UX than the env
var. Deferred (not rejected) — a natural follow-up once the nightly channel is
established and usage patterns are clearer.

## References

- `apps/desktop/src-tauri/tauri.nightly.conf.json` — the overlay config
- `.github/workflows/release-nightly.yml` — the nightly CI workflow
- `apps/desktop/src-tauri/src/commands/app_paths.rs` — `app_config_dir_override`
- `packages/extension-host/src/services/user-config.ts` — `SILO_CONFIG_DIR` override
- ADR 0022 — on-disk storage layout (the three-tier model this builds on)
