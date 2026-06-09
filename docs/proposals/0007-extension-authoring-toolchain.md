---
status: draft
created: 2026-06-04
---

# 0007. Extension authoring toolchain

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

Draft. Sequenced **post-monorepo** — needs a published `@silo-code/sdk` (shim-free leaf)
and the new `@silo-code/extension-tools` / `create-@silo-code/extension` packages.

## References

- [ADR 0003](../decisions/0003-monorepo-pnpm.md),
  [ADR 0004](../decisions/0004-sdk-types-first.md),
  [ADR 0017](../decisions/0017-css-theming-contract.md),
  [RFC 0008](./0008-extension-package-format-remote-install.md).
