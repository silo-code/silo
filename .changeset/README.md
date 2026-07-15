# Changesets (mostly vestigial — read this before touching SDK versioning)

**`@silo-code/sdk` is actually versioned and released by release-please**, not by
this folder. `release-please-config.json` configures `packages/sdk` as a `node`
component alongside the app (`separate-pull-requests: true`), computing the next
version from conventional-commit messages (`feat:`/`fix:`) scoped to files under
`packages/sdk`. Every `sdk-vX.Y.Z` tag/release/CHANGELOG entry going back to 0.9.0
was cut this way — `release-please.yml` proposes the release PR, and merging it
auto-tags, creates the GitHub release (marked pre-release so it never steals the
"Latest" slot from app releases), and auto-dispatches `release-sdk.yml -f
publish=true` to actually publish to npm via OIDC trusted publishing.

**What this means for you:** to ship an SDK change, just write a properly-scoped
conventional commit (`feat(processes): ...`, `fix(sdk): ...`) touching
`packages/sdk` in your PR. You do not need to run `pnpm changeset`, add a file to
this folder, or run `pnpm version-packages` / `pnpm release:sdk` yourself —
release-please picks it up automatically on the next push to `main`.

`pnpm changeset` / `pnpm version-packages` / `pnpm release:sdk` still exist as
scripts, and `.changeset/*.md` files are still a valid (if currently unused)
changesets format — but nothing in CI actually consumes them for versioning
`@silo-code/sdk` right now. **Do not run `pnpm version-packages` manually** —
doing so bumps `packages/sdk/package.json`/`CHANGELOG.md` in changesets' own
format without updating `.release-please-manifest.json` or creating a
release-please-recognized tag, which desyncs release-please's tracking. When
that happened in practice, release-please's next run couldn't recognize the
manual CHANGELOG entry as continuous with its own history and proposed a
release that re-listed the SDK's _entire_ commit history as newly shipped.

`release-sdk.yml` remains a legitimate manual **fallback** — dispatch it with
`publish: true` if the auto-dispatch from release-please ever fails to fire (its
default dry-run mode is always safe to run to sanity-check the publishable
artifact). Just don't pair it with a hand-rolled version bump.

If you're touching this area: this whole folder may be worth removing once
someone confirms nothing else depends on it — flagging here rather than doing
that unprompted.
