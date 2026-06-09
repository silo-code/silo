---
layout: home

hero:
  name: Silo
  text: Run many workspaces at once — switch instantly, without losing state
  tagline: Build on it. Everything from the terminal to the file explorer is an extension talking to the same public API you get.
  actions:
    - theme: brand
      text: Build your first extension
      link: /guide/getting-started
    - theme: alt
      text: API Reference
      link: /api/

features:
  - title: One small, stable API
    details: Extensions touch the running app through a single injected ExtensionContext (ctx) — register what you add, run commands, read and drive state through typed services. Nothing reaches into app internals.
  - title: Register, don't patch
    details: Viewers, side panels, status items, commands, keybindings, menus, settings pages. Register what you add; the host wires it in and hands you a Disposable to remove it.
  - title: First-party = third-party
    details: Silo's own features (terminal, editor, git, themes) are built as extensions against the exact same SDK you use. If a built-in can do it, so can you.
---

## What this site is

Two things, from one source of truth:

- **[Guides](/guide/)** — hand-written, start with [What is an extension?](/guide/)
- **[API Reference](/api/)** — generated directly from the SDK's type
  definitions, so it never drifts from the code. It documents exactly the
  public surface and nothing host-internal.

The SDK is **types-first**: you compile against `@silo-code/sdk` types, and the
host injects the implementation at activation time. The types live in the
`@silo-code/sdk` package (`packages/sdk/src/index.ts`) — the single public
surface an extension imports.
