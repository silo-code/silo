# Busy Status Demo — an example Silo extension

A small example extension for [Silo](../../..) that adds a **Busy Status Demo
side panel** for exercising the host StatusBar's busy-status slot. It
demonstrates:

- **`ctx.ui.busyStatus.set`** — push a sticky status-bar entry (with a label,
  detail, and urgency) and get back a `Disposable` that clears it.
- **The numbered badge** — push two or more entries to see the StatusBar
  collapse them into a count, with a popover listing each one.
- **`ctx.ui.notify`** — the "Notify error" button shows why transient errors
  belong in a toast, not a sticky busy-status entry.

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
folder. A **Busy Status Demo** panel becomes available in the right column.
Use **Disable / Enable / Uninstall** on the Extensions page to manage it.

## The manifest

`package.json` carries the Silo manifest fields under a `silo` key:

```jsonc
{
  "name": "busy-status-demo",
  "displayName": "Busy Status Demo", // shown in the Extensions list
  "version": "0.1.0",
  "silo": {
    "id": "silo.busy-status-demo", // must match `extension.id` in the code
    "engine": "^0.1",
    "main": "dist/index.js", // the built bundle, relative to this folder
  },
}
```
