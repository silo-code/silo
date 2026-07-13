---
status: draft
created: 2026-06-04
---

# 0008. Extension package format + remote install (GitHub / npm)

## Summary

Freeze the extension **package format** (manifest + `dist` layout + sibling CSS)
and add install from a **GitHub release** and the **npm registry**, unifying on a
pre-built **tarball** as the universal distribution unit.

## Motivation

Install is folder-only today. The format must be **frozen before third parties
depend on it** (adding a required field later is a breaking change), and
GitHub/npm are the real distribution channels.

## Design

- **Package format (freeze):** `package.json` with `silo: { id, engine, main }`
  (+ `displayName`, `version`, `description`); `dist/index.js` (ESM; `react`,
  `react/jsx-runtime`, `@silo-code/sdk` external); optional `dist/index.css`
  (auto-injected). Install dir `~/.config/silo/extensions/<id>/`; `installed.json`
  registry; reserve marketplace metadata (`author`, `icon`, `categories`, …) now.
- **Remote install:** the **tarball** is the universal unit (`npm pack` /
  `silo-ext pack`, `package.json` + `dist/`). GitHub resolves `owner/repo` → latest
  release asset; npm resolves `name@version` → registry tarball; both converge on a
  shared `installFromStagingDir`. Two host commands: `http_download` (follows
  redirects) and `extract_tarball`. **Provenance** is recorded in `installed.json`,
  which makes **update-checking** fall out for free. A GitHub Action runs
  `silo-ext pack` and attaches the asset on tag.

## Alternatives considered

- **Source tarball + on-device build** — slow/fragile for end users.
- **Committed `dist/` in the repo** — build artifacts in git; discouraged.

## Decision

Draft. Post-monorepo / go-public. Requires
[RFC 0006](./0006-extension-permissions-sandbox.md) as the trust gate before
loading arbitrary remote code. The marketplace built on this format — and the
amended trust gating — is designed in
[RFC 0014](./0014-extension-registry.md).

## References

- [ADR 0019](../decisions/0019-runtime-extension-loading.md) (loading + id/path
  validation), [RFC 0006](./0006-extension-permissions-sandbox.md),
  [RFC 0007](./0007-extension-authoring-toolchain.md).
