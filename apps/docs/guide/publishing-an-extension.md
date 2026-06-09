# Publishing an extension

An extension is a **standalone package** that anyone installs into Silo from a
folder — no rebuild of the app required. If you've followed [Your first
extension](/guide/getting-started) you've already written one; this page is the
full packaging contract: the manifest, the build, and how the host loads it.

::: tip Status
Installing from a **local folder** is available now. Installing from a **URL /
git / npm registry**, an **`npx` CLI**, and **update checking** are on the
[roadmap](/roadmap#extension-distribution).
:::

## The shape of a package

A published extension is an ordinary npm-style folder:

```
my-extension/
  package.json        # manifest (below)
  dist/index.js       # the built bundle
  src/index.tsx       # your source
  build.mjs           # your bundler config
```

Runnable examples live in the repo under
[`examples/extensions/`](https://github.com/silo-code/silo/tree/main/examples/extensions).
Start from
[`hello-extension`](https://github.com/silo-code/silo/tree/main/examples/extensions/hello-extension)
— the minimal, permission-free starter (one command + one status item) meant to
be copied. The richer ones:
[`clock-extension`](https://github.com/silo-code/silo/tree/main/examples/extensions/clock-extension)
(a status-bar clock, a toggle command, and a settings page),
[`scratchpad-extension`](https://github.com/silo-code/silo/tree/main/examples/extensions/scratchpad-extension)
(a persisted side panel), and
[`permissions-demo-extension`](https://github.com/silo-code/silo/tree/main/examples/extensions/permissions-demo-extension)
(declares `fs:read`, so installing it shows the consent prompt — see
[Permissions & access](/guide/permissions)).

## The manifest

Silo reads its metadata from `package.json` under a `silo` key:

```jsonc
{
  "name": "silo-hello-extension",
  "displayName": "Hello", // shown in the Extensions list (falls back to name)
  "version": "0.1.0", // shown next to the name
  "description": "A full-tour example extension.",
  "silo": {
    "id": "acme.hello", // MUST equal `extension.id` in your code
    "engine": "^0.1", // Silo API version you target
    "main": "dist/index.js", // built bundle, relative to the package root
  },
}
```

The `silo.id` must match the `id` of the [`Extension`](/api/types/interfaces/Extension)
object your bundle exports, or the host refuses to load it (a mismatch between
manifest and code is always a mistake).

## The build contract — externals

Install the SDK and React as **devDependencies** — they provide the types you
compile against and are **never bundled** (the host supplies the runtime):

```sh
npm i -D @silo-code/sdk react @types/react
```

Your extension must **not** bundle its own copy of React or the SDK. Build a
single ESM file that leaves `react`, `react/jsx-runtime`, and `@silo-code/sdk` as
**externals**:

```js
// build.mjs
import { build } from "esbuild";

await build({
  entryPoints: ["src/index.tsx"],
  outfile: "dist/index.js",
  bundle: true,
  format: "esm",
  jsx: "automatic",
  external: ["react", "react/jsx-runtime", "@silo-code/sdk"],
});
```

At load time the host resolves those bare imports to **its own instances**, so:

- there is a **single React** across the host↔extension boundary (two copies
  would break hooks with "invalid hook call"), and
- there is a **single SDK** — `ctx.layout`, `ctx.files`, etc. are the very
  objects the host drives, so your contributions are live.

Your bundle must `export const extension` (or a default export) — the shape the
host loads:

```tsx
import type { Extension } from "@silo-code/sdk";

export const extension: Extension = {
  id: "acme.hello",
  activate(ctx) {
    /* register contributions */
  },
  deactivate() {
    /* optional: undo anything not tracked on ctx.subscriptions */
  },
};
```

## Styling

A runtime-loaded extension's CSS is **not** auto-injected (the host imports only
your JS bundle). Inject a `<style>` element in `activate` and remove it in
`deactivate`, and consume only [design tokens](/guide/styling)
(`--silo-color-*`, `--silo-font*`, `--silo-radius-*`) so your UI themes correctly
and scales with `uiFontSize`:

```tsx
const STYLE_ID = "acme-hello-styles";
activate(ctx) {
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `.hello-clock { color: var(--silo-color-text-hi); }`;
  document.head.appendChild(el);
  // …registrations…
},
deactivate() {
  document.getElementById(STYLE_ID)?.remove();
},
```

## Install, enable, uninstall

1. `npm install && npm run build` in your package to produce `dist/index.js`.
2. In Silo, open **Settings → Extensions → Install from folder…** and choose the
   package folder. The host copies it into `~/.config/silo/extensions/<id>/`
   (skipping `node_modules` and `.git`) and loads it immediately.
3. The extension appears in the list with its display name and version. Use
   **Disable / Enable** to unload/reload it without restarting, and **Uninstall**
   to remove it from disk.

Enabled extensions are recorded in `~/.config/silo/extensions/installed.json` and
**reload automatically** on the next launch; disabled ones stay dormant.

## Lifecycle & cleanup

Every `ctx.register*` call returns a [`Disposable`](/api/types/interfaces/Disposable) that the
host tracks on `ctx.subscriptions`. On **disable/uninstall** the host disposes
all of them for you — your status items, commands, settings pages, and side
panels leave the UI cleanly — then calls your optional `deactivate`. Use
`deactivate` only for things you created _outside_ the `ctx.register*` surface
(an injected `<style>`, a timer, an event listener).

::: warning Dock panel kinds
Side panels, status items, settings pages, commands, and menu items all unload
cleanly. A **dock panel kind** (`ctx.registerDockPanelKind`) registered by a
runtime extension may require a window reload to fully remove if a panel of that
kind is open when you disable it. Prefer a side panel for now.
:::
