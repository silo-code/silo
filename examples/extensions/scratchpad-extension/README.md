# Scratchpad — an example Silo extension

A small example extension for [Silo](../../..) that adds a **Scratchpad side
panel** — a notes panel whose text persists across reloads. It demonstrates two
parts of the public `@silo-code/sdk`:

- **Side panel** — `ctx.registerSidePanel` mounts a panel in the right column.
- **Persistence** — the panel's `storage` (`SidePanelProps.storage`) saves the
  text and restores it once the app state has hydrated.

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
folder. A **Scratchpad** panel becomes available in the right column; type in it
and the text is saved automatically. Use **Disable / Enable / Uninstall** on the
Extensions page to manage it.

## The manifest

`package.json` carries the Silo manifest fields under a `silo` key:

```jsonc
{
  "name": "scratchpad-extension",
  "displayName": "Scratchpad", // shown in the Extensions list
  "version": "0.1.0",
  "silo": {
    "id": "acme.scratchpad", // must match `extension.id` in the code
    "engine": "^0.1",
    "main": "dist/index.js", // the built bundle, relative to this folder
  },
}
```
