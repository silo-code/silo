# Stability & versioning

What you can rely on when you build against `@silo-code/sdk` — what's a permanent
contract, what isn't, and how the surface changes over time.

## The public surface

The contract is the **`@silo-code/sdk` barrel** (`packages/sdk/src/index.ts`) and
everything it re-exports. The rule is simple:

> **If it isn't exported from `@silo-code/sdk`, it isn't public** — and may change
> or disappear without notice.

Every exported symbol carries exactly one tag:

- **`@public`** — part of the supported surface. Permanently licensed (MIT),
  documented, and covered by the versioning policy below. This is what your
  extension is meant to use.
- **`@internal`** — host plumbing that happens to be exported for first-party
  (`core.*`) wiring. **No guarantees** — don't depend on it. The privileged
  `@silo-code/extension-host/internal` subpath is internal in its entirety and is
  never published to npm.

Public symbols also carry a `@category` (`Extension Contract`, `Registration`,
`Consumer Services`, or `Core Types`) — organizational, not a stability signal.

## What's stable vs. planned

The **[Roadmap](/roadmap)** is the source of truth for what's real. A surface
marked <Badge type="tip" text="stable" /> is shipped and covered by this policy;
<Badge type="info" text="planned" /> means designed (often in an
[RFC](https://github.com/silo-code/silo/tree/main/docs/proposals)) but not yet
built — don't write against it until it lands.

## Versioning (SemVer)

`@silo-code/sdk` follows [Semantic Versioning](https://semver.org/). Against the
`@public` surface:

| Bump                | Means             | Examples                                                                                      |
| ------------------- | ----------------- | --------------------------------------------------------------------------------------------- |
| **patch** (`x.y.Z`) | No surface change | doc fixes, internal/host fixes, type-equivalent corrections                                   |
| **minor** (`x.Y.0`) | **Additive only** | a new `ctx` member, a new optional field, a new exported type — existing code keeps compiling |
| **major** (`X.0.0`) | **Breaking**      | removing/renaming a `@public` symbol, changing a signature, tightening a type                 |

Moving a symbol from `@internal` to `@public` is additive (minor). Going the
other way — retracting a `@public` symbol — is breaking (major) and follows the
deprecation policy first.

### Pre-1.0

The SDK is currently **0.x**. By SemVer convention, while pre-1.0 a **minor**
(`0.Y.0`) bump may carry a breaking change — the surface is still settling toward
the all-green roadmap that marks 1.0. We aim to minimize churn and call out
breaks in the changelog, but the hard guarantees above bind firmly **at 1.0**.
Pin a version range you've tested against until then.

## Deprecation policy

Before a `@public` symbol is removed:

1. It's marked **`@deprecated`** in TSDoc with the replacement and the version it
   was deprecated in. Your editor surfaces the strikethrough; the API reference
   shows the notice.
2. It keeps working for **at least one major version** (post-1.0).
3. The removal is called out in the changelog for the major that drops it.

## Declaring compatibility

An extension declares the SDK API version it targets via `silo.engine` in its
manifest (e.g. `"engine": "^0.1"`). This is informational today; once the SDK is
1.0 the host will use it to warn on or refuse an incompatible extension. Build
against the SDK version your `engine` range allows.

## See also

- [Using `ctx`](/api/) — the public surface, member by member.
- [Roadmap](/roadmap) — what's stable, what's planned.
- [Publishing an extension](/guide/publishing-an-extension) — the manifest,
  including `engine`.
