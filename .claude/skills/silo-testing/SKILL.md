---
name: silo-testing
description: Use when writing or updating unit tests in the Silo repo. Covers the co-located Vitest setup, the pure-logic (no @testing-library/react) style and how to extract testable helpers, driving host state directly via the valtio store, and the contract-and-edges coverage expectations.
---

# Testing in Silo

**Every change that adds or changes behavior ships with unit tests in the same
change.** Tests are part of the work, not a follow-up. Don't mark a task done
until `pnpm test` is green with coverage for what you added.

How testing works here:

- **Vitest, co-located.** Put `*.test.ts` / `*.test.tsx` next to the source it
  covers; the package `vitest.config.ts` picks up `src/**/*.{test,spec}.{ts,tsx}`.
  Run everything with `pnpm test`, or one package with
  `pnpm --filter <pkg> exec vitest run <path>`.
- **Pure-logic style.** The suite tests **logic**, not rendered React
  (`@testing-library/react` is intentionally not a dependency). When the logic
  you're adding lives inside a component, **extract it into a pure, exported
  helper** and test that — e.g. `view-switcher-model.ts` (switcher show/segmented/
  dropdown rules), `markdown-preview/menu.ts` (context-menu enablement), and
  `markdown-preview/match.ts` (file matching) were factored out of their
  components precisely so the rules are unit-testable. Components stay thin glue.
- **Host state** can be driven directly: set up `store` (the valtio proxy) and
  the relevant registries in `beforeEach`, exercise the service, assert on the
  store — see `editor-service.test.ts` and `editor-registry.test.ts`.
- **Cover the contract and the edges**, not just the happy path: fallbacks,
  no-ops/guards, disabled states, and "hidden/absent" cases (the editor
  view-switching tests pin the priority tie-break, stale-`viewType` fallback,
  read-only Cut/Paste, and the single-view/diff/untitled hidden cases).
