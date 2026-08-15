---
name: silo-docs-sync
description: Use when adding or changing any public @silo-code/sdk symbol — a new ctx method, exported type, or field — or when editing the project positioning / Context7 index. Covers the docs-in-sync workflow (TSDoc, @public/@internal + @category tags, barrel re-export, hand-authored ctx member page, pnpm docs:api, roadmap flip) and how apps/docs is indexed by Context7.
---

# Keep docs in sync AS YOU BUILD

The API reference is **generated from the source**, so documentation is not a
separate chore — it's part of changing the code. Whenever you touch the public
extension surface, do the documentation in the same change.

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
7. **Flip its status on the [Roadmap](../../../apps/docs/roadmap.md)** from `planned`
   to `stable` (the `<Badge>`). The roadmap is the source of truth for what's real.

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
`apps/docs/index.md`, and keep the root `CLAUDE.md` opening + `docs/domain-language.md`
aligned with that same positioning (do not reintroduce older taglines). The
`context7-refresh` job in `.github/workflows/docs.yml` re-triggers indexing on
every push to `main`.
