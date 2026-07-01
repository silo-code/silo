# Contributing to Silo

Thanks for your interest in Silo! This guide covers the workflow and the
conventions the project enforces.

## Getting started

Silo is a [pnpm](https://pnpm.io/) workspace; run commands from the repo root.

```bash
pnpm install
pnpm dev             # runs the isolated "Silo Dev" build
```

You'll need [Rust](https://www.rust-lang.org/tools/install) and the
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS.

## Local checks

The pre-commit hook runs the boundary lint, the formatter check, and the
tests. Run them yourself anytime (from the repo root):

| Task                              | Command                                                        |
| --------------------------------- | -------------------------------------------------------------- |
| Lint (architecture boundary gate) | `pnpm lint`                                                    |
| Format                            | `pnpm format` (check with `pnpm format:check`)                 |
| Typecheck                         | `pnpm --filter silo exec tsc --noEmit`                         |
| Frontend tests                    | `pnpm test`                                                    |
| Rust tests                        | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` |

CI runs all of these on every PR; they must pass before merge.

## Architecture boundary (important)

Extensions (`packages/extensions-core` and `packages/extensions-silo`) may touch
the app **only** through `ctx` and `@silo-code/sdk` types — never by importing the
host's `state`, `services`, `layout`, `panels`, `docked`, or `components`. This
is enforced first by the **package graph**: an extension package can only resolve
what it declares as a dependency, so `@silo-code/extensions-silo` (which depends on
`@silo-code/sdk` only) physically cannot import the host's privileged
`@silo-code/extension-host/internal` surface. Lint covers the rest — the platform
ban (no raw `@tauri-apps`/`node:` in extensions) and the design-token-only CSS
rule. If an extension needs a capability the SDK lacks, that's a signal to add it
to `ctx` and document it — not to reach into internals. See
[`CLAUDE.md`](CLAUDE.md) and [`docs/`](docs/).

## Commits & pull requests

This project uses **[Conventional Commits](https://www.conventionalcommits.org/)**.
The `commit-msg` hook validates every commit message, and CI validates PR titles.

```
<type>(<optional scope>): <subject>

# types: feat, fix, docs, refactor, perf, test, build, ci, chore
```

Examples: `feat(terminal): add split pane`, `fix: handle empty workspace path`,
`refactor(file-explorer): extract tree-node component`.

- **Branch** off `main` (e.g. `feat/split-pane`, `fix/dirty-indicator`).
- PRs are **squash-merged**, so the **PR title** becomes the commit on `main` —
  make it a valid Conventional Commit. The head branch is auto-deleted on merge.
- A `feat:` bumps the minor version; a `fix:` bumps the patch; `feat!:` or a
  `BREAKING CHANGE:` footer bumps major.

## Releases

Silo has two release channels that run completely independently:

**Stable** is automated via
[release-please](https://github.com/googleapis/release-please): merged
conventional commits feed a "release vX.Y.Z" PR that bumps versions and updates
`CHANGELOG.md`. Merging that PR tags `silo-vX.Y.Z`, which triggers the build +
publish of installers and the updater manifest. Maintainers don't bump versions
by hand.

**Nightly** builds from `main` automatically every day at 3am UTC via the
`release-nightly.yml` workflow. Nightly is a separate application ("Silo
Nightly", identifier `com.silo.desktop.nightly`) that installs side-by-side with
stable and uses its own data directories. The version string is auto-generated:
`0.x.y-nightly.YYYYMMDD.githash`. The nightly GitHub Release is pinned to the
`nightly` tag and overwritten on every build — release-please is not involved.

To trigger a nightly build manually, use **Actions → release-nightly →
Run workflow** on GitHub.

## License

By contributing, you agree your contributions are licensed under the project's
[MIT License](LICENSE).
