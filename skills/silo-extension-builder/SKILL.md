---
name: silo-extension-builder
description: Help the user design, write, compile, and install a Silo extension
  from a natural-language description. The extension follows the same format as any
  publishable Silo extension and can be shared via npm or a tarball URL when ready.
tools: Bash, Read, Write
---

# Extension Builder

Turn a natural-language description into a working Silo extension. The extension
is real, publishable TypeScript — not a prototype or a hack. `silo install` drops
it into Silo immediately; `silo uninstall` removes it cleanly.

## Arguments

The skill accepts two optional arguments: `id` and `path`.

- **`id`** — the extension id (e.g. `dave.clock`). If not provided, ask the user.
- **`path`** — the directory to create the extension in. If not provided, default to `/tmp/silo-ext/<id>` and confirm with the user.

Parse arguments from the invocation line. Examples:

- `/silo-extension-builder id=dave.clock` — id given, use default path
- `/silo-extension-builder path=~/projects/my-ext` — path given, ask for id
- `/silo-extension-builder id=dave.clock path=~/projects/my-ext` — both given, skip both questions
- `/silo-extension-builder` — neither given, ask for both before proceeding

## Workflow (always in this order)

1. **Resolve args** — extract `id` and `path` from the invocation; ask the user for any that are missing
2. **Scaffold** — run `npx create-silo-extension` to create the directory structure and manifest
3. **Plan** — identify which `ctx.*` APIs the extension needs (see API Reference below)
4. **Write** the implementation to `<path>/src/index.tsx` (overwrites the scaffold placeholder)
5. **Compile** with esbuild (output to `<path>/dist/index.js`)
6. **Ask** — show the user the compiled output path and ask if they want to install it now
7. **Install** (only if the user says yes) via `silo install <path>`
8. **Tell the user** what to look for in Silo

## Choosing an extension id

If the user didn't supply one, ask before writing any files. Pick a namespaced id
that reflects what the extension does: `dave.clock`, `dave.tasks`,
`dave.git-branch`, etc. The user's name or handle makes a natural namespace.

## Step 2 — Scaffold

Run `create-silo-extension` with all known args to avoid interactive prompts.
Prefer the local build when inside the Silo repo; fall back to `npx` otherwise:

```bash
# Prefer the local build (works before npm publish); fall back to npx
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
LOCAL_SCAFFOLD="$REPO_ROOT/packages/create-silo-extension/dist/index.js"
if [ -f "$LOCAL_SCAFFOLD" ]; then
  SCAFFOLD_CMD="node $LOCAL_SCAFFOLD"
else
  SCAFFOLD_CMD="npx --yes create-silo-extension"
fi

$SCAFFOLD_CMD \
  --id dave.<slug> \
  --path <path> \
  --name "<Display Name>" \
  --description "<short description>" \
  --publisher "<publisher>"
```

This creates `<path>/src/index.tsx` (placeholder) and `<path>/package.json`.
Skip this step if the directory already exists from a previous run.

## Step 3 — Source file shape (write over the scaffold placeholder)

```tsx
// /tmp/silo-ext/<id>/src/index.tsx
import React, { useState, useEffect } from "react";
import type { Extension, SidePanelProps } from "@silo-code/sdk";
import { useServiceState } from "@silo-code/sdk";

export const extension: Extension = {
  id: "dave.<slug>",
  manifest: {
    name: "My Extension",
    description: "What it does.",
    version: "0.1.0",
  },
  activate(ctx) {
    // register contributions here
  },
};
```

## Step 4 — Compile

```bash
cd <path> && npm run build
```

The scaffold's `package.json` includes `build` (one-shot) and `dev` (watch) scripts
wired to esbuild with the correct flags. Use `npm run dev` for interactive iteration.

## Step 5 — Tell the user what to look for

There is no programmatic verification — Silo is a production desktop app.
Describe what appeared and where:

- **Status bar item**: "A clock now appears on the left side of the status bar."
- **Side panel**: "Open the left sidebar and click the Tasks icon to see the panel."
- **Command**: "Run it via the command palette (⌘K → 'Tasks: Add item')."
- **Extensions panel**: "It should appear in Settings → Extensions with an Uninstall button."

## Iteration

To **rebuild**: `cd <path> && npm run build`, ask the user if they want to
reinstall, then `silo install <path>` if they confirm. Silo replaces the installed version.

To **remove**: `silo uninstall <id>`

## Publishing

When the extension is ready to share:

1. Move source to a proper project directory
2. `npm publish`
3. Others install it from Silo's Extensions settings page by typing the package name

---

## API Reference

### Registration — what `activate(ctx)` can register

**Commands** — named, invokable actions:

```typescript
ctx.registerCommand({ id: "dave.foo.bar", label: "Foo: Do Bar", run: () => { ... } });
```

**Status bar items** — widgets in the strip at the bottom:

```typescript
ctx.registerStatusItem({
  id: "dave.foo.status",
  alignment: "left" | "right",
  priority: 0, // lower = further left/right
  tooltip: "optional hover text",
  component: MyStatusWidget, // React component, no props
});
```

**Side panels** — left or right column panels:

```typescript
ctx.registerSidePanel({
  id: "dave.foo.panel",
  location: "left" | "right",
  title: "My Panel",
  component: MyPanel, // receives SidePanelProps
  lazyMount: true, // defer mount until first open (good for async panels)
});
```

`SidePanelProps`: `{ active: boolean, storage: ExtensionStorage, hydrated: boolean }`

**Settings pages** — a page in the Settings dialog:

```typescript
ctx.registerSettingsPage({
  id: "dave.foo.settings",
  title: "My Settings",
  component: MySettings,
});
```

**Menu items** — entry in File/Edit/View/Window menu:

```typescript
ctx.registerMenuItem({
  id: "dave.foo.item",
  menu: "file",
  command: "dave.foo.bar",
  label: "...",
  group: "9_custom",
});
```

**Keybindings** — keyboard shortcut:

```typescript
ctx.registerKeybinding({
  id: "dave.foo.key",
  key: "cmd+shift+l",
  command: "dave.foo.bar",
});
```

**Avoid `registerDockPanelKind`** — dock kinds can't be cleanly removed without a reload.

---

### Services — what `ctx.*` provides

**`ctx.process.exec(cmd, args, opts?)`** — one-shot subprocess:

```typescript
const { stdout, code } = await ctx.process.exec("git", [
  "branch",
  "--show-current",
]);
// cwd defaults to active workspace folder
```

**`ctx.workspaces`** — reactive workspace state:

```typescript
const ws = useServiceState(ctx.workspaces); // inside a React component
const activeFolder = ws.open.find((w) => w.id === ws.activeId)?.folder;
```

**`ctx.editors`** — editor/document model:

```typescript
const es = useServiceState(ctx.editors);
// es.activeEditorId, es.editors (array), etc.
```

**`ctx.files`** — filesystem:

```typescript
const text = await ctx.files.readText(path);
await ctx.files.writeText(path, content);
const entries = await ctx.files.list(dir);
```

**`ctx.ui`** — toast notifications, file pickers, modals:

```typescript
ctx.ui.notify("info" | "warn" | "error", "message");
const path = await ctx.ui.pickFile();
const ok = await ctx.ui.confirm({
  title: "...",
  body: "...",
  confirmLabel: "...",
});
```

**`SidePanelProps.storage`** — persisted key/value per panel:

```typescript
storage.get<T>("key"); // read (returns undefined if missing)
storage.set("key", value); // write (undefined deletes)
storage.subscribe(listener); // re-render when storage changes
```

---

### React patterns

**Reactive workspace subscription** (get active workspace folder):

```typescript
function MyStatusWidget() {
  const ws = useServiceState(ctx.workspaces);
  const folder = ws.open.find((w) => w.id === ws.activeId)?.folder ?? null;
  // ...
}
```

**CSS theming** — always use design tokens, never hard-code colors/fonts:

```css
color: var(--silo-color-fg);
background: var(--silo-color-surface);
border: 1px solid var(--silo-color-border);
font-family: var(--silo-font-mono);
border-radius: var(--silo-radius-sm);
```

---

## Example Prompts

**Git branch status bar:**

> `/silo-extension-builder` Create a status bar item on the left that shows the current git branch for the active workspace, with a dot when there are uncommitted changes. Update when the active workspace switches.

**Workspace task list:**

> `/silo-extension-builder` Create a right-side panel called "Tasks" with a persistent to-do list. Items have a checkbox and a delete button. Persist tasks so they survive app restarts.

**GitHub issues panel:**

> `/silo-extension-builder` Create a right-side panel called "Issues" that fetches open GitHub issues for the active workspace's repo using `gh issue list --json number,title,url`. Show a refresh button and make each issue a clickable link. Load lazily on first open.

**Open PRs panel:**

> `/silo-extension-builder` Same as the Issues panel but for pull requests — call it "Pull Requests", use `gh pr list --json number,title,isDraft,url`, and dim draft PRs.

**Scratch pad:**

> `/silo-extension-builder` A right-side panel called "Scratch Pad" with a full-height textarea, persisted via storage so notes survive restarts. Use Silo's theme tokens for colors and the monospace font.

**Word count status bar:**

> `/silo-extension-builder` A right-aligned status bar item showing the word count of the currently active editor. Update when the active editor changes.
