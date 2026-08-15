# Silo — project guide for coding agents

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
- `docs/domain-language.md` — the domain glossary: ubiquitous language for the
  product, including UI component naming (Panels & Docking, Navigator, …).
  Kept current via the workflow in `.claude/skills/silo-domain-modeling/SKILL.md`.
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

## Engineering principles

- Choose the simplest implementation that fully meets the current
  requirements. Avoid speculative abstractions, configuration, and indirection
  in implementation code. This doesn't apply to the public SDK surface
  (`ctx`, `@silo-code/sdk`) — that's designed ahead of full usage on purpose
  (see the roadmap's `planned` → `stable` flow above); the bar there is
  deliberate API design, not premature abstraction.
- Grow the system in layers. Start from the smallest version that works end
  to end, and add each new capability on top of a product that already
  works. Never trade a working product for unfinished complexity.
- Keep components modular and concerns clearly separated.
- Prefer established, well-maintained libraries over reimplementing common
  functionality, and lean on dependencies already in the project before
  adding new ones or writing your own. Don't assume a library lacks a
  capability without checking its docs and types.
- Make architectural decisions for the long term. Don't accept a stopgap
  that only works for now and is meant to be replaced later.

## Self-documentation — keep docs in sync AS YOU BUILD

The API reference is **generated from the source**, so touching the public
extension surface (the `@silo-code/sdk` barrel `packages/sdk/src/index.ts` and
everything it re-exports) means doing the docs in the **same change** — never as
a follow-up. When you add or change a public symbol — a new `ctx` method, type,
or field — run the full workflow (TSDoc, `@public`/`@internal` + `@category`
tags, barrel re-export, the hand-authored `ctx` member page, `pnpm docs:api`,
flipping the roadmap badge) and the Context7 indexing contract for
`context7.json` — documented in `.claude/skills/silo-docs-sync/SKILL.md`.

**Docs-driven development:** the public **Roadmap** (`apps/docs/roadmap.md`) is the
source of truth for what's real; design decisions live as ADRs (`docs/decisions/`)
and proposals (`docs/proposals/`). Design a new primitive by adding it to the
roadmap as `planned` (with its sketched surface) _first_, then implement it and
flip it to `stable`. Expanding `ExtensionContext` (`ctx`) is the main ongoing
work — and the moment to run through that workflow.

## Domain language — keep the glossary in sync AS YOU BUILD

When you introduce or resolve domain vocabulary — a new concept worth naming,
a naming collision, a term that needs sharpening — update
`docs/domain-language.md` in the **same change**, not as a follow-up. Prefer
terms already there over inventing synonyms. When the change is also a
candidate for a durable decision record, write the ADR (`docs/decisions/`) or
RFC (`docs/proposals/`) alongside it — see `docs/decisions/README.md` /
`docs/proposals/README.md` for which one and the format. Do this actively —
challenge fuzzy terms, work through edge-case scenarios, and write the result
down the moment it crystallizes, not after the fact — per the workflow in
`.claude/skills/silo-domain-modeling/SKILL.md`.

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

The **design-system kit** (RFC 0016 / ADR 0026 — `Button`, `List`,
`ModalActions`, …) has **one source**: the public `@silo-code/sdk`. There is no
internal fork — the host and bundled extensions consume the same components at
HEAD via `workspace:*`, so first-party Silo UI and third-party extension UI build
from identical markup. When building Silo, **reach for the kit**, don't
re-hand-roll a modal input/list/badge. The host may import kit components from
`@silo-code/sdk` just as it imports SDK types (host → SDK is the normal leaf
direction; nothing lints against it). The **chrome line**: the kit covers the
_content_ of modals, settings pages, and property tabs; host **chrome** — the
`<Modal>` shell (ADR 0018), the Settings rail, the status-bar container, panels,
the title bar — stays bespoke and host-owned, styled via **component tokens**.
See ADR 0026 for the full rationale and the version asymmetry (internal rides
HEAD, third parties ride the last published SDK).

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

**Every tooltip uses the SDK `Tooltip`, never the native `title` attribute.**
`Tooltip` (`packages/sdk/src/Tooltip.tsx`) is the one tooltip implementation —
consistent 600ms delay, styling, and positioning app-wide, both in the host
chrome and every extension. A native `title` attribute renders with the
browser's own (unstyled, immediate-on-hover, per-OS) tooltip instead, which
looks inconsistent next to every other tooltip in the app. This applies
everywhere a hover hint is needed, not just on already-interactive elements —
wrap the target in `<Tooltip content="...">...</Tooltip>`.

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
  `domain-language.md`), not ALLCAPS. The only exception is the conventional
  `README.md`.
- **All host-side logging goes to the Output panel, never `console.*`/devtools.**
  Use `createHostChannel` (`packages/extension-host/src/extension-host/output-store.ts`)
  to log from host code. Before adding a new channel, check whether an
  existing one is a close fit (e.g. `silo:application`/"Application" for
  core.\* extension activity, `silo:extension-host`/"Extension Host" for host
  lifecycle) — only create a dedicated channel (e.g. `silo:agents`/"Agents")
  when the thing being logged is genuinely a new subsystem with its own
  diagnostic surface.
- **Commit messages and PR titles are Conventional Commits**: `type(scope):
summary` — e.g. `feat(git-explorer): add "View Commits" drill-down`,
  `fix(file-explorer): scope "View Commits" to the branch`. Check `git log`
  for the type/scope vocabulary already in use before inventing a new scope.
  This isn't just a style nit: GitHub squash-merges every PR using its title
  as the resulting commit message on `main`, so an untitled/prose PR title
  (e.g. "Fix some file explorer bugs") becomes the permanent, non-conventional
  entry in `git log` — get the title right before opening the PR, not after.

## Testing — write unit tests for all new functionality

**Every change that adds or changes behavior ships with unit tests in the same
change.** Tests are part of the work, not a follow-up — the same way docs are
(see "Self-documentation" above). Don't mark a task done until `pnpm test` is
green with coverage for what you added. For the repo's conventions — co-located
Vitest, the pure-logic (no `@testing-library/react`) style and how to extract
testable helpers, driving host state via the `store` proxy, and the
contract-and-edges coverage bar — see `.claude/skills/silo-testing/SKILL.md`.

## Reference docs

### Issue tracker

Issues live as GitHub issues in `silo-code/silo`, via the `gh` CLI. See
`docs/issue-tracker.md`.

### Triage labels

Default label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`,
`ready-for-human`, `wontfix`). See `docs/triage-labels.md`.

### Modal & extension UI design

Decision table for building modal content, settings pages, or workspace
property tabs with the [Design System](https://getsilo.dev/design/) kit —
which surface, which component, and the forbidden list. See
`docs/modal-design.md`.
