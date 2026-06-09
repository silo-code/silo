# Notification Demo — an example Silo extension

A small example extension for [Silo](../../..) that adds a **command** opening a
menu of sample **toasts and modals** — a quick way to see (and iterate on) every
notification variant the [`ctx.ui`](../../../apps/docs/api/ui/index.md) surface
offers. Everything is driven through the public `@silo-code/sdk`:

- **Trigger** — a command (`ctx.registerCommand`) reachable from the **View
  menu** (`ctx.registerMenuItem`) or **`cmd+shift+m`** (`ctx.registerKeybinding`),
  opening a themed menu (`ctx.ui.showMenu`). No status-bar widget.
- **Toasts** — `ctx.ui.notify(level, message, options?)`: plain `info` / `warn` /
  `error`, a toast with a **title + body**, and toasts with **action buttons**
  (including a `keepOpen` action and a `durationMs` override).
- **Modals** — `ctx.ui.showModal` (a "View details" output viewer and a small
  custom form), plus `ctx.ui.confirm` and `ctx.ui.prompt`.

It also shows the **"View details" pattern**: an error toast whose action opens
the full output in a modal — the same flow Silo's Git panel uses for commit
errors.

## Build

```sh
npm install
npm run build      # → dist/index.js
```

The bundle treats `react`, `react/jsx-runtime`, and `@silo-code/sdk` as
**externals** — the Silo host resolves them to its own instances at load time, so
there's a single React (hooks work) and a single SDK.

## Install

In Silo, open **Settings → Extensions → Install from folder…** and choose this
folder. Then open the playground from the **View** menu (**Notification
Playground**) or press **`cmd+shift+m`**, and pick any row to preview that toast
or modal. Use **Disable / Enable / Uninstall** on the Extensions page to manage
it.

## The manifest

`package.json` carries the Silo manifest fields under a `silo` key:

```jsonc
{
  "name": "notify-demo-extension",
  "displayName": "Notification Demo", // shown in the Extensions list
  "version": "0.1.0",
  "silo": {
    "id": "acme.notify-demo", // must match `extension.id` in the code
    "engine": "^0.1",
    "main": "dist/index.js", // the built bundle, relative to this folder
  },
}
```

## Notes

- A runtime-loaded extension's CSS isn't auto-injected, so this example injects a
  `<style>` on `activate` and removes it on `deactivate`. It consumes only
  `--silo-*` design tokens, so it themes with the rest of the app.
- The "View details" modal reuses the host `.silo-modal-actions` footer and the
  `.silo-button*` classes so it matches `confirm` / `prompt` chrome.
