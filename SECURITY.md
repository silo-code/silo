# Security Policy

## Reporting a vulnerability

Please report security issues **privately**, not in public issues or pull
requests. Use GitHub's private reporting: the repository's **Security** tab →
**Report a vulnerability** (GitHub Security Advisories). Include the affected
version/commit, reproduction steps, and the impact you observed.

We aim to acknowledge a report within a few days and will coordinate a fix and
disclosure timeline with you.

## Supported versions

Silo is pre-1.0. Security fixes target the **latest released version** and
`main`; older versions are not maintained.

## Scope — what is and isn't a vulnerability

Silo's extension security model is **documented and deliberate**, so some things
that look like holes are known design, not bugs:

- **Extensions are trusted, in-process code.** A third-party extension runs in
  the same process as the app and shares its privileges. Workspace path-scoping
  and the install-time capability consent
  ([permissions guide](apps/docs/guide/permissions.md),
  [ADR 0015](docs/decisions/0015-phased-security-model.md)) provide
  **honest-mistake containment, consent, and audit — not a sandbox.** A
  determined hostile extension can bypass the `ctx` chokepoint entirely; this is
  a known limitation tracked in
  [RFC 0006](docs/proposals/0006-extension-permissions-sandbox.md) (sandboxed
  execution). "An installed extension accessed files / the network" is therefore
  **by design**, not a reportable vulnerability — until the sandbox lands, the
  rule is _install extensions you trust_.

**In scope** (please do report): anything that lets content cross a boundary the
docs claim is enforced — e.g. a path that escapes workspace scoping _through
`ctx.files`_ without the declared permission, a path-traversal in extension
install, the dev automation bridge being reachable in a release build, or code
execution from opening/previewing a file you didn't author.

When in doubt, report it privately — we would rather triage a non-issue than miss
a real one.
