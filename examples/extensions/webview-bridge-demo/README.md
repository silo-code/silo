# Webview Bridge Demo — an example Silo extension

A small example extension for [Silo](../../..) that adds a **Webview Bridge
Demo** panel — a mini browser embedded in Silo, for exercising the
`ctx.webview` bridge end-to-end against a real cross-origin iframe. It
demonstrates:

- **`ctx.webview.attach`** — attach the bridge to an `<iframe>`, and its
  `onNavigate` / `onBlocked` events.
- **`exec`** — run arbitrary JS inside the iframe and see the result.
- **`pickElement`** — click-to-select an element inside the iframe, returning
  its selector and text.
- **`capture` / `captureFullPage` / `captureRect`** — screenshot the visible
  viewport, the full page, or a user-dragged region.

It's an internal diagnostic tool as much as a demo — the styling is
functional, not polished — and doubles as a reference implementation of the
public `ctx.webview` API, the same way any third-party extension would
consume it.

## Build

```sh
npm install
npm run build      # → dist/index.js
```

`@silo-code/sdk` is a **devDependency** — installed for its types, never bundled.
The build treats `react`, `react/jsx-runtime`, and `@silo-code/sdk` as **externals**,
so the Silo host resolves them to its own instances at load time and there's a
single React (hooks work) and a single SDK.

## Install

In Silo, open **Settings → Extensions → Install from folder…** and choose this
folder. Reach the panel via **Window → Webview Bridge Demo** (it's
deliberately not on any "New Panel" menu or toolbar). Use **Disable / Enable /
Uninstall** on the Extensions page to manage it.

## The manifest

`package.json` carries the Silo manifest fields under a `silo` key:

```jsonc
{
  "name": "webview-bridge-demo",
  "displayName": "Webview Bridge Demo", // shown in the Extensions list
  "version": "0.1.0",
  "silo": {
    "id": "silo.webview-bridge-demo", // must match `extension.id` in the code
    "engine": "^0.1",
    "main": "dist/index.js", // the built bundle, relative to this folder
  },
}
```
