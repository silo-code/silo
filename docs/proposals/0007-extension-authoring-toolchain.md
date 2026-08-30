---
status: draft
created: 2026-06-04
---

# 0007. Extension authoring toolchain

> **Partly delivered — narrowed.** The scaffolder shipped as
> `npx create-silo-extension` (stable), but **not** as the
> `@silo-code/extension-tools` CLI proposed below: the generated `package.json`
> carries plain `esbuild` `build` / `dev` / `pack` scripts with the externals
> baked in, which removed the hand-written `build.mjs` without adding a wrapper
> CLI to maintain. `silo-ext build` / `silo-ext dev` are therefore **withdrawn**.
> Still open, and the reason this stays a draft: **CSS auto-injection** (every
> extension, first-party examples included, still hand-rolls a `<style>` element
> on `activate` and removes it on `deactivate`) and the SDK **`createStore`**
> helper. See also [RFC 0008](./0008-extension-package-format-remote-install.md),
> whose frozen package format already assumes the auto-injected
> `dist/index.css`.

## Summary

Make authoring a third-party extension a one-command experience: a scaffolder, a
zero-config build/dev CLI, host **CSS auto-injection**, and an SDK `createStore`
helper. Target: `npm create @silo-code/extension` → `npm run dev` → live, for a
~15-line extension with no `build.mjs` and no shims.

## Motivation

Today an author hand-writes a `build.mjs` (and must get the `react` / `@silo-code/sdk`
externals exactly right), hand-rolls `<style>` injection and the reactive-store
pattern, and relies on a `tsconfig` path-alias + `silo-host-shims.d.ts`. Each is
avoidable boilerplate.

## Design

- **CSS auto-injection** — the host loader injects a sibling `dist/index.css` (and
  removes it on unload); authors just `import "./styles.css"`.
- **`createStore<T>`** in `@silo-code/sdk` — a `ReactiveService<T>` + setter, replacing
  the hand-rolled listener-set.
- **`@silo-code/extension-tools`** — a published CLI: `silo-ext build` (esbuild with the
  externals + CSS emission baked in) and `silo-ext dev` (watch + a host reload seam).
- **`create-@silo-code/extension`** scaffolder + a mirrored GitHub "use this template"
  repo.

## Alternatives considered

- **Keep the hand-rolled per-extension boilerplate** (status quo) — clunky; the
  five friction points motivating this are documented in the DX plan.

## Decision

Draft, narrowed to **CSS auto-injection + `createStore`**. The scaffolder half is
done (`npx create-silo-extension`) and the `@silo-code/extension-tools` CLI is
withdrawn — see the note at the top. The remaining two are the friction an author
still hits today; the loader change (inject a sibling `dist/index.css` on load,
remove it on unload) is the higher-value of the pair because the frozen package
format in [RFC 0008](./0008-extension-package-format-remote-install.md) already
promises it.

## References

- [ADR 0003](../decisions/0003-monorepo-pnpm.md),
  [ADR 0004](../decisions/0004-sdk-types-first.md),
  [ADR 0017](../decisions/0017-css-theming-contract.md),
  [RFC 0008](./0008-extension-package-format-remote-install.md).
