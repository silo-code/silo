# Your first extension

We'll build a small but complete extension: a **status-bar clock** with a
**command** to toggle 12/24-hour format and a **keybinding** for it. It uses
three of `ctx`'s registration methods — a realistic slice of the API in ~40
lines.

::: tip What you're building
An extension is a **standalone package** — your own folder, with its own
`package.json`, that you build against [`@silo-code/sdk`](/api/) (installed from
npm as a devDependency) and install into Silo **from a folder**. You don't need
Silo's source to build one. This page writes the code; [Publishing an
extension](/guide/publishing-an-extension) covers the packaging contract in full.
Installing from a URL / npm registry is on the
[roadmap](/roadmap#extension-distribution).
:::

## 1. Scaffold

Make a folder for your extension, install the SDK and React as devDependencies,
and add `src/index.tsx`:

```sh
mkdir clock-extension && cd clock-extension
npm i -D @silo-code/sdk react @types/react
```

```tsx
// src/index.tsx
import { useEffect, useState } from "react";
import type { Extension } from "@silo-code/sdk";

export const extension: Extension = {
  id: "acme.clock",
  activate(ctx) {
    // everything goes here
  },
};
```

An extension is just an [`Extension`](/api/types/interfaces/Extension) object. `activate` runs
once; `ctx` is your [`ExtensionContext`](/api/).

## 2. Add a command

A [`Command`](/api/types/interfaces/Command) is a named action. We'll have it flip a flag held
in module scope (a real extension might persist this — see step 5).

```tsx
activate(ctx) {
  let use24h = false;

  ctx.registerCommand({
    id: "clock.toggleFormat",
    label: "Clock: Toggle 12/24-Hour",
    run: () => { use24h = !use24h; },
  });
}
```

[`registerCommand`](/api/registration/register-command) returns a
[`Disposable`](/api/types/interfaces/Disposable); the host also tracks it on
`ctx.subscriptions`, so you don't have to clean it up manually.

## 3. Bind a key

A [`Keybinding`](/api/types/interfaces/Keybinding) points a shortcut at a command id:

```tsx
ctx.registerKeybinding({
  id: "clock.toggleFormat",
  key: "cmd+shift+k",
  command: "clock.toggleFormat",
});
```

## 4. Render it in the status bar

A [`StatusItem`](/api/types/interfaces/StatusItem) is a React component placed at one end of the
status bar. Clicking it runs our command via
[`ctx.executeCommand`](/api/other/execute-command):

```tsx
function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const time = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: !use24h,
  });

  return (
    <button onClick={() => ctx.executeCommand("clock.toggleFormat")}>
      {time}
    </button>
  );
}

ctx.registerStatusItem({
  id: "clock",
  alignment: "right",
  priority: 10,
  component: Clock,
});
```

Defining `Clock` _inside_ `activate` lets it close over `ctx` and `use24h`.
`activate` runs once, so the component identity stays stable.

## 5. Build & install

Add a `silo` key to your `package.json` so the host knows your extension's id and
where its built bundle lives — the `id` **must** match `extension.id` from step 1:

```jsonc
{
  "name": "clock-extension",
  "displayName": "Clock",
  "version": "0.1.0",
  "type": "module",
  "scripts": { "build": "node build.mjs" },
  "silo": {
    "id": "acme.clock", // must equal extension.id
    "engine": "^0.1",
    "main": "dist/index.js",
  },
}
```

Bundle to a single ESM file, leaving `react`, `react/jsx-runtime`, and
`@silo-code/sdk` as **externals** — the host supplies its own instances at load
time (see [the build contract](/guide/publishing-an-extension#the-build-contract-externals)
for why):

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

Then `npm run build` and, in Silo, open **Settings → Extensions → Install from
folder…** and pick your `clock-extension` folder. The clock appears at the right
of the status bar; click it or press <kbd>⌘⇧K</kbd> to toggle the format. Edits
reload with **Disable / Enable** — no app restart. See [Publishing an
extension](/guide/publishing-an-extension) for the full packaging reference.

## Going further

- **Persist the format** with the storage handed to side panels
  ([`ExtensionStorage`](/api/types/interfaces/ExtensionStorage)) or your own approach, instead
  of a module-scoped flag.
- **Open files** from a command via
  [`ctx.workspaces.openFile`](/api/state/workspaces) — the sanctioned entry
  point for editor tabs.
- **Add a settings page** with
  [`registerSettingsPage`](/api/registration/register-settings-page) (the
  [`clock-extension`](https://github.com/silo-code/silo/tree/main/examples/extensions/clock-extension)
  example adds one).
- Browse every type in the **[API Reference](/api/)**.
