# Extension checklist

A pre-flight check before you call an extension done — whether it's a
standalone package you're about to publish or a `core.*`/`silo.*` extension
bundled into this repo. Each item links to the page that explains it; this page
doesn't repeat the reasoning, just the list.

## Architecture boundary

- [ ] Touches the app only through `ctx` and `@silo-code/sdk` types — never a
      host internal (`state`, `services`, `layout`, `panels`, `docked`,
      `components`). See [What is an extension?](/guide/what-is-an-extension).
- [ ] No raw `@tauri-apps/*` or `node:*` imports — platform access goes through
      `ctx` (use [`path`](/api/other/path) instead of `node:path`, for
      example).

## Permissions

- [ ] `package.json`'s `silo.permissions` lists only what the extension
      actually needs (`fs:read`, `fs:write`, `process`, `network`) — no
      permission requested "just in case." See
      [Permissions & access](/guide/permissions).
- [ ] File and process access uses workspace-relative paths where possible,
      rather than assuming an absolute path will be granted.

## Styling

- [ ] CSS uses only extension-safe design tokens (`--silo-color-*`,
      `--silo-font*`, `--silo-radius-*`, `--silo-button-*`) — never a
      component token (`--silo-content-*`, `--silo-statusbar-*`, …) or an
      internal token (`--silo-internal-*`). See
      [Styling your extension](/guide/styling).
- [ ] No hard-coded colors, fonts, or pixel sizes — they break theming and
      `uiFontSize` scaling.
- [ ] No hand-rolled `:focus` styling. The host's shared `:focus-visible` ring
      already covers every interactive element; if you must suppress the
      native outline on a base element, `outline: none` is enough — the
      shared rule still wins on focus.

## Modal UI

- [ ] Modal content, settings pages, and workspace property tabs are built
      from the [Design System](/design/) component kit (`Button`, `Input`,
      `List`/`ListRow`, `Section`, `ModalActions`, …) — not bespoke markup.
      See [Building modals](/guide/building-modals).
- [ ] No custom modal title, close button, or footer — `showModal`'s `title`
      option, the host's ✕/Escape, and `ModalActions` own those.
- [ ] Settings pages and property tabs have **no footer** — every control
      persists the moment it changes.

## Lifecycle

- [ ] Everything registered in `activate(ctx)` comes back as a
      [`Disposable`](/api/types/interfaces/Disposable) (or is added to
      `ctx.subscriptions`), so disable/uninstall tears it down fully.
- [ ] Anything created **outside** `ctx.register*` — an injected `<style>`
      element, a timer, a manual event listener — is cleaned up in
      `deactivate`. See
      [Lifecycle & cleanup](/guide/publishing-an-extension#lifecycle-cleanup).

## Publishing an API

- [ ] If `activate()` returns an API for other extensions to consume, its
      types ship in their own dedicated npm package — never bundled into the
      extension itself. See [`@silo-code/git-api`](https://github.com/silo-code/silo/tree/main/packages/git-api)
      for a worked example and
      [Extension-to-extension APIs](/guide/extension-apis) for the full
      pattern.

## Packaging

- [ ] `package.json`'s `silo` manifest is correct: `id` matches the
      `Extension.id` your bundle exports, `main` points at the built bundle,
      `engine` targets a real API version. See
      [Publishing an extension](/guide/publishing-an-extension).
- [ ] React and `@silo-code/sdk` are declared as externals, not bundled — the
      host supplies both at load time.

## Stability

- [ ] Every `ctx` API the extension depends on shows **stable** (not
      `experimental` or `planned`) on the [Roadmap](/roadmap) — an
      `experimental` surface may still change under you.

## If you're contributing to this repo

Bundled `core.*` / `silo.*` extensions carry two more obligations that
third-party packages don't:

- [ ] Any new or changed public `ctx` surface has TSDoc, a `@category` tag, a
      barrel export from `packages/sdk/src/index.ts`, and a hand-authored page
      — see the Self-documentation section of `AGENTS.md`.
- [ ] Any new behavior has unit tests co-located as `*.test.ts` — see the
      Testing section of `AGENTS.md`.
