# Changesets

This folder versions the **publishable npm packages** in the monorepo via
[changesets](https://github.com/changesets/changesets). Today that is exactly one
package: **`@silo-code/sdk`** — every other package is `private: true`, and
changesets skips private packages.

Add a changeset whenever you change the public SDK surface:

```sh
pnpm changeset
```

Pick `@silo-code/sdk`, a bump level (patch / minor / major — the SDK is a stable
public contract, so treat removals/renames as **major**), and write a one-line
summary. The file it creates is committed alongside your change; at release time
`pnpm version-packages` rolls accumulated changesets into the version + CHANGELOG,
and `pnpm release:sdk` builds and publishes.

> **Note:** the desktop app (`apps/desktop`, the `silo` package) is versioned and
> released separately by **release-please** (`release-please-config.json` +
> `.github/workflows/release-please.yml`). The two systems never touch the same
> package — changesets owns `@silo-code/sdk`; release-please owns the app.
