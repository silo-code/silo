# Your first extension

We'll build a small but complete extension: a **status-bar clock** with a
**command** to toggle 12/24-hour format and a **keybinding** for it. It uses
three of `ctx`'s registration methods — a realistic slice of the API in ~40
lines.

::: tip What you're building
An extension is a **standalone package** — your own folder, with its own
`package.json`, that you build against [`@silo-code/sdk`](/api/) (installed from
npm as a devDependency) and install into Silo via the CLI or the Extensions
settings page. You don't need Silo's source to build one. This page writes the
code; [Publishing an extension](/guide/publishing-an-extension) covers the
packaging contract in full.
:::

## 1. Scaffold

The fastest way to get started is the `create-silo-extension` scaffolding tool.
Run it from any directory and answer the prompts:

```sh
npx create-silo-extension
```

It will ask for an extension id, display name, description, publisher, and
output path, then create the project:

```
acme.clock/
  src/index.tsx    ← extension source (edit this)
  package.json     ← manifest with silo.id, silo.main, build scripts
  dist/            ← compiled output (populated by npm run build)
```

You can also pass flags to skip the prompts:

```sh
npx create-silo-extension --id acme.clock --name "Clock" --path ~/my-extensions/acme.clock
```

The scaffolded `src/index.tsx` starts from this shell — a complete
[`Extension`](/api/types/interfaces/Extension) object whose `activate` is where
all registrations go:

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

`activate` runs once on load; `ctx` is your [`ExtensionContext`](/api/).

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

The scaffolded `package.json` already has the `silo` manifest key and build
scripts set up. The `silo.id` **must** match `extension.id` in your code (the
scaffold ensures this):

```jsonc
{
  "name": "silo-acme-clock",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "build": "esbuild src/index.tsx --bundle ...",
    "dev": "esbuild src/index.tsx --bundle ... --watch",
  },
  "silo": {
    "id": "acme.clock", // must equal extension.id
    "engine": "^0.1",
    "main": "dist/index.js",
    "publisher": "Acme",
  },
}
```

Build the extension (the scaffold uses esbuild, leaving `react`,
`react/jsx-runtime`, and `@silo-code/sdk` as **externals** — see [the build
contract](/guide/publishing-an-extension#the-build-contract-externals)):

```sh
cd acme.clock
npm run build        # one-shot compile
npm run dev          # watch mode — recompiles on every save
```

Then install it into Silo:

```sh
silo install .       # install from the current folder
```

Or open **Settings → Extensions → Install from folder…** and pick the folder.

The clock appears at the right of the status bar; click it or press
<kbd>⌘⇧K</kbd> to toggle the format. To uninstall:

```sh
silo uninstall acme.clock
```

Edits reload with **Disable / Enable** in the Extensions settings — no app
restart needed. See [Publishing an extension](/guide/publishing-an-extension)
for the full packaging reference.

## Going further

- **Persist the format** with the storage handed to side panels
  ([`ExtensionStorage`](/api/types/interfaces/ExtensionStorage)) or your own approach, instead
  of a module-scoped flag.
- **Open files** from a command via [`ctx.editors`](/api/editors/) — the
  sanctioned entry point for editor tabs.
- **Add a settings page** with
  [`registerSettingsPage`](/api/registration/register-settings-page) (the
  [`clock-extension`](https://github.com/silo-code/silo/tree/main/examples/extensions/clock-extension)
  example adds one).
- **Polish the UI** — [Styling your extension](/guide/styling),
  [Workspace status, sections & badges](/guide/workspace-status), and
  [Keyboard navigation](/guide/keyboard-navigation).
- **Ship it** — [Permissions & access](/guide/permissions) and
  [Publishing an extension](/guide/publishing-an-extension).
- Browse every type in the **[API Reference](/api/)**.
