# Clock — an example Silo extension

A small example extension for [Silo](../../..) that adds a **live status-bar
clock**, a **command** to toggle 12/24-hour format, and a **settings page** —
three contribution points through the public `@silo-code/sdk`:

- **Status item** — a live clock (`ctx.registerStatusItem`).
- **Command** — `Clock: Toggle 24-hour clock` (`ctx.registerCommand`), runnable
  from the menu / command palette.
- **Settings page** — toggle 24-hour / show-seconds (`ctx.registerSettingsPage`).

It also shows the **reactive-service** pattern: a tiny settings store
implementing `ReactiveService`, read by both the clock and the settings page via
`useServiceState`, so they stay in sync.

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
folder. The clock appears in the status bar, the command shows in the palette,
and a **Clock** settings page appears. Use **Disable / Enable / Uninstall** on
the Extensions page to manage it.

## The manifest

`package.json` carries the Silo manifest fields under a `silo` key:

```jsonc
{
  "name": "clock-extension",
  "displayName": "Clock", // shown in the Extensions list
  "version": "0.1.0",
  "silo": {
    "id": "acme.clock", // must match `extension.id` in the code
    "engine": "^0.1",
    "main": "dist/index.js", // the built bundle, relative to this folder
  },
}
```
