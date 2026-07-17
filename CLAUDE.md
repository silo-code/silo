# Silo — project guide for Claude

Silo keeps **all your projects alive at once** — for developers juggling coding
agents (Tauri + React + TypeScript). Open many workspaces and switch instantly;
each keeps its terminals, agents, panels, and layout intact in the background.
**100% open source**, free forever. **Extensible**: modeled on VS Code / Obsidian
with a small stable core, a public extension SDK, and first-party features built
as extensions — so the bar for boundaries, documentation, and a clean public
surface is high.

Product positioning for humans lives in `README.md` / `apps/docs/index.md` /
`context7.json`. Prefer those over inventing a tagline. This file is agent
orientation (architecture, boundaries, commands), not marketing copy.

Orientation docs (read when relevant):

- `docs/decisions/` — ADRs: the architecture decisions of record (the durable "why").
- `docs/proposals/` — RFCs: forward-looking designs not yet decided.
- `docs/ui-terminology.md` — high-level UI component naming.
- `docs/silo-extensions-repo.md` — the **external** `silo-code/silo-extensions`
  repo (cloned at `../silo-extensions`): how its third-party extensions relate to
  this repo — published-SDK lag, npm (not pnpm) build commands, runtime trust /
  `silo.permissions`, and how to install a branch without merging. They
  **publish into** the registry; discovery is Browse /
  [extensions.getsilo.dev](https://extensions.getsilo.dev), not cloning that repo.
- `docs/extensions-registry-repo.md` — the **external**
  `silo-code/extensions-registry` repo (cloned at `../extensions-registry`):
  git-backed catalog behind
  [extensions.getsilo.dev](https://extensions.getsilo.dev) (humans) and
  [registry.getsilo.dev](https://registry.getsilo.dev) (app/CLI index). How it
  relates to in-app Browse / install / update in this monorepo.
- `apps/docs/guide/extension-checklist.md` — pre-flight checklist for any
  extension (bundled or third-party): boundaries, permissions, styling,
  lifecycle, packaging, stability.

## Self-documentation — keep docs in sync AS YOU BUILD

The API reference is **generated from the source**, so documentation is not a
separate chore — it's part of changing the code. Whenever you touch the public
extension surface, do the documentation in the same change:

**The public surface** is the `@silo-code/sdk` barrel `packages/sdk/src/index.ts`
and everything it re-exports (`types.ts` + the `*-service.ts` type contracts +
`context-keys.ts`, all under `packages/sdk/src/`).

The docs site has two layers (see `apps/docs/`):

- **Hand-authored, member-centric pages** — the navigable narrative organized by
  what you do with `ctx`: `apps/docs/api/index.md` (overview + shape diagram), then
  one subdirectory per `ctx` domain (`apps/docs/api/registration/`,
  `apps/docs/api/editors/`, `apps/docs/api/state/`, `apps/docs/api/storage/`,
  `apps/docs/api/other/`, …), one page per `ctx` member. The `apiSidebar` in
  `apps/docs/.vitepress/config.ts` is the source of truth for the current set of
  domains.
- **Generated type leaves** — TypeDoc renders the SDK types into
  `apps/docs/api/types/` (drill-down targets, linked from the member pages).

When you **add or change a public symbol** (a new `ctx` method, a new type, a new
field):

1. **Write TSDoc** on it — a summary plus per-member docs. Use `{@link Other}`
   to cross-reference. Mandatory: every exported public symbol must be documented.
2. **Tag it.** Add exactly one of `@public` / `@internal`, and a `@category`
   (one of: `Extension Contract`, `Registration`, `Consumer Services`,
   `Core Types`). `@internal` keeps host-only exports out of the reference.
3. If it's a genuinely public type, **re-export it from `packages/sdk/src/index.ts`**
   (the barrel is the declared surface; if it's not in the barrel, it's not public).
4. **If you added a `ctx` member**, add its hand-authored page under
   `apps/docs/api/<domain>/<name>.md` (copy an existing one for the shape:
   blurb → signature → example → type links → see-also) and add it to the
   `apiSidebar` in `apps/docs/.vitepress/config.ts`. Link it from the overview
   table in `apps/docs/api/index.md`.
5. **Regenerate the type reference:** `pnpm docs:api` (writes
   `apps/docs/api/types/`, committed so growth shows in diffs).
6. **Update the guides** in `apps/docs/guide/` if the change is user-facing. Guides
   link to member pages (`/api/registration/...`) and types (`/api/types/...`).
7. **Flip its status on the [Roadmap](apps/docs/roadmap.md)** from `planned` to
   `stable` (the `<Badge>`). The roadmap is the source of truth for what's real.

**Docs-driven development:** the public **Roadmap** (`apps/docs/roadmap.md`) is the
source of truth for what's real; design decisions live as ADRs (`docs/decisions/`)
and proposals (`docs/proposals/`). Design a new primitive by adding it to the
roadmap as `planned` (with its sketched surface) _first_, then implement it and
flip it to `stable`. The roadmap going all-green on core = the inflection point
where new features become extensions, not core changes.

When you **expand `ExtensionContext` (`ctx`)** — the main ongoing work — that is
exactly the moment to do all of the above. A documented `ctx` surface is both
the invariant #4 burn-down _and_ the docs site growing. They are the same act.

## External docs indexing (Context7)

`apps/docs` is indexed by [Context7](https://context7.com) (library ID
`/silo-code/silo`) so coding agents can pull Silo's docs directly. What gets
indexed and how the project is described there is controlled by the root
`context7.json` — keep its `description` in sync with `README.md` /
`apps/docs/index.md`, and keep this file's opening + `CONTEXT.md` aligned with
that same positioning (do not reintroduce older taglines). The
`context7-refresh` job in `.github/workflows/docs.yml` re-triggers indexing on
every push to `main`.

## Architecture boundaries — enforced, don't regress

The repo is a pnpm workspace; the boundary is now expressed by the **package
graph**. The relevant packages:

- `@silo-code/sdk` (`packages/sdk`) — the public, types-first leaf. The only
  surface `silo.*` and third-party extensions may import.
- `@silo-code/extension-host` (`packages/extension-host`) — the workbench host
  runtime (state, services, layout, docked, panels, components, the registry +
  loader that provide `ctx`). Owns the **privileged**
  `@silo-code/extension-host/internal` subpath, importable by `core.*` only.
- `@silo-code/extensions-core` (`core.*`) / `@silo-code/extensions-silo`
  (`silo.*`) — the bundled first-party extensions.

Extensions must touch the app **only** through `ctx` and `@silo-code/sdk` types —
never the host's `state`/`services`/`layout`/`panels`/`docked`/`components`. This
is enforced **first by package visibility**: a package can only resolve what it
declares as a dependency. `@silo-code/extensions-silo` depends on `@silo-code/sdk`
alone, so a `silo.*` extension _physically cannot_ import the privileged surface
(or another extension package); `@silo-code/extensions-core` depends on the host,
so it can. Lint (the repo-root `eslint.config.js` + `stylelint.config.js`, run via
`pnpm lint` and the pre-commit hook) covers what the graph can't express: the
**platform ban** (no raw `@tauri-apps/*` or `node:*` in extensions — route through
`ctx`), host-internal **leaf layering** (`state`/`services` don't import out), and
the **design-token-only CSS** rule.

- Do **not** add new boundary violations. If an extension needs a capability the
  SDK lacks, that's a signal to **add it to `ctx`** (and document it), not to
  reach into internals.
- The old ESLint/stylelint **ratchet baselines retired** with the monorepo — the
  one seam they baselined (silo `git-explorer` ↔ `git`) is now a legitimate
  intra-package import. There is no suppressions file to prune; new violations
  simply fail.

The **CSS surface** (the theming contract — ADR 0017 + the public token reference
`apps/docs/api/theming.md`): all host design tokens are `--silo-*`, and an
extension's CSS may consume only the **design tokens** (`--silo-color-*`,
`--silo-font*`, `--silo-radius-*`, `--silo-button-*`) — never a **component token**
(`--silo-content-*`, `--silo-statusbar-*`, …) or an **internal token**
(`--silo-internal-*`). Enforced by the stylelint rule
`silo/extension-design-tokens-only` (folded into `pnpm lint`, run over each
extension package's CSS). **Don't hard-code colors/fonts/px sizes in extension
CSS** — that breaks theming and `uiFontSize` scaling.

**Don't hand-roll focus styles.** There is one shared focus ring — the global
`:focus-visible` rule in `packages/extension-host/src/layout/theme.css` gives
every interactive element (`button`, `input`, `[role="button"]`, …) the accent
`outline`. Adding a per-element focus style (e.g. recoloring the border on
`:focus`) stacks a second ring on top of it, producing a **double outline**. Rely
on the shared ring; if you must suppress the native one on a base element use
`outline: none` (the global rule has higher specificity and still wins on focus).

## Commands

All run from the repo root (pnpm workspace).

| Task                                           | Command                                |
| ---------------------------------------------- | -------------------------------------- |
| Run the dev app (isolated "Silo Dev" identity) | `pnpm dev`                             |
| Build a release bundle                         | `pnpm --filter silo app:build`         |
| Typecheck                                      | `pnpm --filter silo exec tsc --noEmit` |
| Lint (boundary gate)                           | `pnpm lint`                            |
| Test (all packages)                            | `pnpm test`                            |
| Regenerate API reference                       | `pnpm docs:api`                        |
| Docs site (live)                               | `pnpm docs:dev`                        |
| Docs site (build)                              | `pnpm docs:build`                      |

## Conventions

- Match the surrounding code's style; the ESLint config enforces boundaries, not
  formatting.
- Bundled extensions live in `packages/extensions-core/src/<name>/` (`core.*`) or
  `packages/extensions-silo/src/<name>/` (`silo.*`), are re-exported from that
  package's barrel (`src/index.ts`), and are wired in by the app's composition
  root (`apps/desktop/src/builtins.ts`), which hands the ordered list to the
  host's `activateExtensions`. Model new ones on `image-viewer` (editor,
  `silo.*`) or `about` (settings page, `core.*`) — both touch the app only
  through `ctx`. Run through the
  [extension checklist](apps/docs/guide/extension-checklist.md) before calling
  a new one done.
- No legacy/internal brand names in source — the product is `Silo`.
- Docs under `docs/` use lowercase kebab-case filenames (`automation.md`,
  `ui-terminology.md`), not ALLCAPS. The only exception is the conventional
  `README.md`.

## Testing — write unit tests for all new functionality

**Every change that adds or changes behavior ships with unit tests in the same
change.** Tests are part of the work, not a follow-up — the same way docs are
(see "Self-documentation" above). Don't mark a task done until `pnpm test` is
green with coverage for what you added.

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
  no-ops/guards, disabled states, and "hidden/absent" cases (the new editor
  view-switching tests pin the priority tie-break, stale-`viewType` fallback,
  read-only Cut/Paste, and the single-view/diff/untitled hidden cases).

## Agent skills

### Issue tracker

Issues live as GitHub issues in `silo-code/silo`, via the `gh` CLI. See
`docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`,
`ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context, mapped to this repo's existing `docs/decisions/` (ADRs) and
`docs/proposals/` (RFCs). See `docs/agents/domain.md`.

**Path mismatch note**: the installed `domain-modeling`, `improve-codebase-architecture`,
and `grill-with-docs` skills (from mattpocock/skills) hardcode `CONTEXT.md` and
`docs/adr/` in their own instructions — they don't read `docs/agents/domain.md`.
When running them: treat any `docs/adr/` reference as `docs/decisions/` (read
existing ADRs from there; write new ones there, continuing the existing numbering
— don't create a separate `docs/adr/` directory); `CONTEXT.md` at the repo root
has no existing equivalent, so create it fresh if one of these skills needs it.
These skills have no concept of `docs/proposals/` (RFCs) — that tier is outside
their vocabulary, so don't expect them to read or write there.
