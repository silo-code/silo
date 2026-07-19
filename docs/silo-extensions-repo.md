# The external `silo-extensions` repo

Some official extensions live **outside this monorepo**, in the separate GitHub
repo [`silo-code/silo-extensions`](https://github.com/silo-code/silo-extensions).
Locally it's cloned as a sibling of this repo — from the Silo repo root that's
`../silo-extensions` (i.e. `projects/silo-extensions`). This note captures how
that repo relates to this one, so working across the boundary doesn't require
rediscovering it each time.

## Discovery vs. this repo

`silo-extensions` is a **publisher** of packages, not the catalog. Released
extensions appear on [extensions.getsilo.dev](https://extensions.getsilo.dev)
and in **Settings → Extensions → Browse** via the
[`extensions-registry`](./extensions-registry-repo.md) index. To install one as
a user: Browse, `silo install <id>`, or the website — **do not** clone this repo
just to try a published release.

Clone / build / folder-install here when **developing** an extension (or testing
a branch that isn't on the registry yet).

## What lives there

Independently-installable extensions, one per top-level folder
(`docs-panel`, `local-web-viewer`, `system-monitor`, …). Each is its own npm
package. These are the model for **third-party** extensions — unlike the bundled
`core.*` / `silo.*` extensions in `packages/extensions-*`, they consume Silo only
through the public SDK and are installed at runtime, not compiled into the app.

## It is NOT part of this pnpm workspace

It's plain per-package **npm**, not pnpm. Build/test/typecheck commands run
**inside each extension's folder**, not from the monorepo root:

| Task      | Command (run in `silo-extensions/<ext>/`)   |
| --------- | ------------------------------------------- |
| Install   | `npm install`                               |
| Build     | `npm run build` (esbuild → `dist/index.js`) |
| Test      | `npx vitest run`                            |
| Typecheck | `npx tsc --noEmit`                          |

There's a shared `tsconfig.base.json` at the repo root and a `build:all` loop in
the root `package.json`. `dist/` and `*.tgz` are gitignored — a build is required
after cloning; the compiled output is never committed.

## They depend on the _published_ SDK, not this workspace

Each extension's `devDependency` is the **npm-published** `@silo-code/sdk`, not
the `packages/sdk` in this repo. Consequence: **they lag the monorepo.** A new
`ctx` member is usable inside this repo the moment it's added, but only reaches
these extensions after the SDK is published to npm and the extension bumps its
dependency. (Example: `ctx.system` shipped in SDK `0.17.0`; `system-monitor` had
to move to `@silo-code/sdk@^0.18.0` to use it.)

In their esbuild config, `react`, `react/jsx-runtime`, and `@silo-code/sdk` are
marked **external** — the host injects its own singletons at load, so the
extension shares one React and one SDK instance. CSS is loaded as a text string
and injected at activate time.

**The modal design system (RFC 0016)** was the previous instance of this lag,
now on `@silo-code/sdk@0.29.0`: both extensions bumped their dependency, and
`github-actions` adopted `EmptyState` for its "no repo" / "all workflows
passing" screens. Most of both extensions' modal markup — `system-monitor`'s
Processes modal (a custom heat-mapped tree table with mini bar charts) and
the rest of `github-actions`'s workflow-run modal (run cards, section
headers, footer toggles) — is either intentionally bespoke (data
tables/charts are [out of the kit's scope](https://getsilo.dev/design/))
or simply hasn't been migrated yet. Adopting more of `Button`/`List`/
`ModalActions`/etc. there is a UI change that wants the repo owner's design
review, not something to do unattended — see
[Building modals](https://getsilo.dev/guide/building-modals) for the
migration target when that review happens.

## Trust and permissions (the part that bites)

At runtime these are **third-party / untrusted** extensions, _even the ones using
the `silo.` id namespace_. Trust comes from being in the app's composition root
(`apps/desktop/src/builtins.ts`), **not** from the id. Untrusted means their
`ctx.files` / `ctx.process` access is **path-scoped to the workspace** (see
`packages/extension-host/.../security/resolve-path.ts`).

To reach beyond that scope they must declare capabilities in `package.json` under
`silo.permissions` — an array drawn from the host's `KNOWN_PERMISSIONS`
(`extension-manager.ts`): `"fs:read"`, `"fs:write"`, `"process"`, `"network"`.

- Reading a path outside the workspace (e.g. `/proc/stat`) needs **`fs:read`**.
- `ctx.process.exec` defaults its cwd to the workspace root, so it works
  permission-free _only when a workspace is open_; an explicit out-of-workspace
  cwd — or robustness when no folder is open — needs **`process`**.
- `silo.engine` is currently **informational** — the host does not enforce it.
  Set it to the real minimum SDK/host version the extension needs, as
  documentation rather than a gate.

## Installing one without merging to `main`

For a **released** id that's already ingested, prefer the registry path:
`silo install <id>` or Settings → Extensions → Browse
(see [`extensions-registry-repo.md`](./extensions-registry-repo.md)).

For a **branch** that isn't on the registry yet, the host
`ExtensionManager` offers:

- **Install from folder** (`previewInstall`) — point at a built extension dir.
  Easiest for a branch: clone, `npm install && npm run build`, install the folder.
- **Install from URL** (`installFromUrl`) — downloads a `.tgz` from any URL
  (GitHub release asset or direct). The tarball must be **`npm pack` output**:
  npm-standard `package/` layout, a `package.json` with the `silo.*` manifest,
  and the built `dist/` (pulled in via the `files` field). A raw git-branch
  codeload tarball does **not** qualify — no built `dist/`, wrong layout.
- **Install from npm** (`installFromNpm`) — by package name from npm (sideload;
  not the Silo registry).
- **Install from registry** (`installFromRegistry`) — by `<publisher>.<name>`
  from [registry.getsilo.dev](https://registry.getsilo.dev).

So to test a branch on another machine: either clone + build + install-folder, or
`npm pack` the built extension and attach the `.tgz` to a GitHub **pre-release**
(tag-based, independent of `main`), then install-from-URL with the asset link.
