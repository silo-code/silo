---
name: extension-builder
description: Help the user design, write, and run a Silo extension from a
  natural-language description. The extension follows the same format as any
  publishable Silo extension and can be shared via npm or a tarball URL when
  ready. Deploying it into Silo's live-extensions folder is how you test it
  immediately — not the end goal.
tools: Bash, Read, Write
---

# Extension Builder

Turn a natural-language description into a working Silo extension. The extension
is real, publishable TypeScript — not a prototype or a hack. Deploying it to the
watched `live-extensions/` folder lets Silo load it within ~200ms so the user
can see it immediately, without a restart or an install wizard.

## Workflow (always in this order)

1. **Plan** — identify which `ctx.*` APIs the extension needs (see API Reference below)
2. **Write** source to `/tmp/silo-ext/<id>/src/index.tsx`
3. **Write** manifest to `/tmp/silo-ext/<id>/package.json`
4. **Compile** with esbuild
5. **Deploy** the bundle to the watch folder
6. **Tell the user** what to look for in Silo

## Step 1 — Choose an extension id

Pick a namespaced id that reflects what the extension does: `dave.clock`,
`dave.tasks`, `dave.git-branch`, etc. The user's name or handle makes a natural
namespace. The bundle filename **must match** the id: `dave.clock.js` ↔ `id: "dave.clock"`.

## Step 2 — Determine the config dir

The watch folder is `{userConfigDir}/live-extensions/`. Check which build is running:

```bash
if [ -d "$HOME/.config/silo-dev" ]; then
  LIVE_DIR="$HOME/.config/silo-dev/live-extensions"
else
  LIVE_DIR="$HOME/.config/silo/live-extensions"
fi
mkdir -p "$LIVE_DIR"
```

## Step 3 — Source file shape

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

## Step 4 — package.json

```json
{
  "name": "silo-<slug>",
  "version": "0.1.0",
  "description": "...",
  "silo": {
    "id": "dave.<slug>",
    "main": "dist/index.js",
    "publisher": "Dave"
  }
}
```

## Step 5 — Compile + Deploy (single Bash call)

```bash
if [ -d "$HOME/.config/silo-dev" ]; then
  LIVE_DIR="$HOME/.config/silo-dev/live-extensions"
else
  LIVE_DIR="$HOME/.config/silo/live-extensions"
fi
mkdir -p "$LIVE_DIR"

ID="dave.<slug>"
SRC="/tmp/silo-ext/$ID"

# Compile — externalize the three shared deps; the host injects them at load time
pnpm exec esbuild "$SRC/src/index.tsx" \
  --bundle \
  --format=esm \
  --platform=browser \
  --target=es2020 \
  --jsx=automatic \
  --external:react \
  --external:react/jsx-runtime \
  --external:@silo-code/sdk \
  --outfile="$LIVE_DIR/$ID.js"

echo "Deployed $ID"
```

## Step 6 — Tell the user what to look for

There is no programmatic verification — Silo is a production desktop app.
Describe what appeared and where:

- **Status bar item**: "A clock now appears on the left side of the status bar."
- **Side panel**: "Open the left sidebar and click the Tasks icon to see the panel."
- **Command**: "Run it via the command palette (⌘K → 'Tasks: Add item')."

## Iteration

To **update**: re-run the compile step. Silo hot-replaces within ~200ms.

To **remove**: delete the file — `rm "$LIVE_DIR/dave.<slug>.js"`

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

> `/extension-builder` Create a status bar item on the left that shows the current git branch for the active workspace, with a dot when there are uncommitted changes. Update when the active workspace switches.

**Workspace task list:**

> `/extension-builder` Create a right-side panel called "Tasks" with a persistent to-do list. Items have a checkbox and a delete button. Persist tasks so they survive app restarts.

**GitHub issues panel:**

> `/extension-builder` Create a right-side panel called "Issues" that fetches open GitHub issues for the active workspace's repo using `gh issue list --json number,title,url`. Show a refresh button and make each issue a clickable link. Load lazily on first open.

**Open PRs panel:**

> `/extension-builder` Same as the Issues panel but for pull requests — call it "Pull Requests", use `gh pr list --json number,title,isDraft,url`, and dim draft PRs.

**Scratch pad:**

> `/extension-builder` A right-side panel called "Scratch Pad" with a full-height textarea, persisted via storage so notes survive restarts. Use Silo's theme tokens for colors and the monospace font.

**Word count status bar:**

> `/extension-builder` A right-aligned status bar item showing the word count of the currently active editor. Update when the active editor changes.
