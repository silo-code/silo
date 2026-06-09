<!--
PR titles must be Conventional Commits (e.g. "feat(terminal): add split pane").
The title becomes the squash-merge commit on main and feeds release versioning.
-->

## What & why

<!-- What does this change and why? Link any related issue. -->

## How to test

<!-- Steps to verify, or note the tests that cover it. -->

## Checklist

- [ ] PR title is a valid Conventional Commit
- [ ] `pnpm lint`, `pnpm format:check`, `pnpm --filter silo exec tsc --noEmit`, and `pnpm test` pass
- [ ] No new architecture-boundary violations (built-ins touch the app only via `ctx`)
- [ ] Docs/`ctx` reference updated if the public extension surface changed
