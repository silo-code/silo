---
status: draft
created: 2026-08-13
---

# 0025. Declaring a version floor on another extension's API

## Summary

Let an extension declare "I need `acme.provider` at version `>=1.2.0`" in its
manifest, checked against that provider's actual installed
`ExtensionManifest.version` — the same floor-only, additive-only shape
`silo.engine` already uses for host-version compatibility, generalized to
cover extension-to-extension dependencies instead of just extension-to-host.

## Motivation

[RFC 0024](https://github.com/silo-code/silo/blob/main/docs/proposals/0024-git-detection-handler-claim-protocol.md)
and the
[Extension-to-extension APIs guide](https://github.com/silo-code/silo/blob/main/apps/docs/guide/extension-apis.md)
establish that a provider extension publishes its API's types as their own
npm package (`@silo-code/git-api`), consumed via `ctx.getExtension<API>(id)`.
That leaves a real gap: `getExtension` resolves by a plain string id at
runtime with **no structural check** — nothing verifies that what's actually
behind `"acme.provider"` still matches the shape the consumer's installed
types claim. If the consumer compiled against a newer API surface than
what's actually running, the failure is a runtime `TypeError`, not a
compile error, and there's currently no way to express "I need at least
version X of this."

This gap has two different shapes depending on how the provider is
distributed, and they don't need the same fix:

1. **A bundled, first-party provider** (`silo.git`, `silo.theme-presets`, …)
   ships compiled into the Silo app itself — it has no independent version
   that can drift from the app's own version. "What version of `GitAPI` do I
   need" and "what version of Silo do I need" are the same question, and
   `silo.engine`'s existing host-version floor already answers it. Nothing
   new is needed here — the actual gap is that `@silo-code/git-api`'s
   changelog doesn't yet make "which Silo version first shipped this" legible,
   so a consumer knows what `engine` floor to declare. That's a documentation
   fix, not an architecture one.
2. **An independently-distributed provider** (a third-party extension another
   third-party extension depends on) has a version that genuinely can drift
   independently of both the host and the consumer. This is the case with no
   existing answer, and what this RFC actually designs for.

## Design

### The manifest field

```json
{
  "silo": {
    "id": "acme.consumer",
    "engine": ">=0.47.0",
    "dependencies": {
      "acme.provider": ">=1.2.0"
    }
  }
}
```

Floor only, same as `engine` — no upper-bound range syntax. This isn't a
simplification for its own sake; it's the direct consequence of the
additive-only policy this session already settled on (see RFC 0024's
motivation and the surrounding discussion): if providers never remove or
reshape existing members, a newer provider version always satisfies an older
floor, so there's nothing an upper bound would ever protect against.

### What gets checked, and against what

`packages/extension-host/src/extension-host/engine-compat.ts` already has
the exact comparison primitive this needs (`parseEngineFloor` +
`compareVersions` + the "no constraint when data is missing or unparsable"
default). Generalizing it: instead of comparing a declared floor against
`hostVersion` (a single global value), compare it against the _depended-on
extension's_ resolved `ExtensionManifest.version` — which already exists
today, auto-populated from a third-party extension's own `package.json`
version (see `ExtensionManifest` in `@silo-code/sdk`).

Built-in (`core.*`/`silo.*`) extensions currently declare no `version` at
all (`silo.git`'s manifest is just `{ name, description }`) — they're
covered by case 1 above, not this mechanism. A dependency floor against an
extension with no declared version should behave like `isEngineCompatible`
already does for missing/unparsable data: **no constraint, don't warn** —
permissive by default, consistent with the existing function's own stated
philosophy rather than inventing a stricter default for this one case.

### Soft, not hard

A declared dependency should be **informational, not blocking**. The SDK
already establishes — and every provider-consuming example in the
extension-apis guide follows — that a consumer must _always handle the
provider's absence_ (`getExtension` may return `undefined`, or `.active` may
be `false`). A version-floor mismatch is the same shape of "not fully
available" as absence, not a reason to refuse the consumer's own activation
outright. Concretely: on a mismatch, log a warning (visible in the
consumer's own Output channel) rather than blocking `activate()` — the
consumer's existing absence-handling already has to cover "the API isn't
there or doesn't do what I expect," so this rides that same path instead of
adding a second, stricter failure mode.

### Where it's surfaced

Two candidate points, not mutually exclusive:

- **At consumer activation**: before or during `activate(ctx)`, check each
  declared dependency against what's actually installed/active and log a
  mismatch.
- **At install/browse time**: the extensions registry could show "requires
  `acme.provider` ≥1.2.0" as metadata on a listing, and warn (not block) an
  install where that isn't currently satisfied.

Both are useful; the activation-time check is the one that actually catches
a real runtime mismatch, so it's the one worth building first if this moves
forward.

## Alternatives considered

**Full semver ranges (not floor-only).** Rejected for the same reason
`silo.engine` rejected them: with an additive-only policy, an upper bound
protects against a class of breakage (removed/reshaped members) that
shouldn't happen. If that policy is ever violated in practice, this is worth
revisiting — but designing for a violation of a policy just adopted is
premature.

**Hard-blocking on a mismatch** (refuse to activate). Rejected: it's a
stricter failure mode than absence gets today, for a problem that's the same
shape as absence. Extensions already have to tolerate a missing/inactive
provider; a version-floor miss should route through that same tolerance, not
a new one.

**Top-level `dependencies` (unnested from `silo`)**, colliding in name with
npm's own `package.json.dependencies` (a completely different concept — npm
packages, not Silo extension ids). Rejected: nesting under the existing
`silo` manifest key (alongside `engine`) already disambiguates it the same
way `silo.engine` isn't confused with anything else; a top-level field
wouldn't have that.

## Decision

Filled in when this leaves `draft` — i.e., when a concrete third-party
provider-to-provider dependency exists to build and check this design
against.
