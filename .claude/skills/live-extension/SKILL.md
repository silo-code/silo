---
name: live-extension
description: Write, compile, and hot-load a Silo extension into the running app
  without restart or install wizard. The extension uses the same format as any
  publishable Silo extension and can be packaged for npm/sharing later. Requires
  Silo to be running (the live-extensions watch folder is always active).
tools: Bash, Read, Write
---

# Live Extension Loader

Generate a Silo extension from a natural-language description, compile it to a
single ESM bundle, and drop it in the watched `live-extensions/` directory. Silo
detects the file and loads it within ~200ms — no restart, no install flow.

## Workflow (always in this order)

1. **Plan** — identify which `ctx.*` APIs the extension needs (see API Reference below)
2. **Write** source to `/tmp/silo-live-ext/<id>/src/index.tsx`
3. **Write** manifest to `/tmp/silo-live-ext/<id>/package.json`
4. **Compile** with esbuild
5. **Deploy** the bundle to the watch folder
6. **Verify** by running a screenshot

All five steps belong in a single Bash tool call. Do not split across turns.

## Step 1 — Determine the config dir

The watch folder is `{userConfigDir}/live-extensions/`. Config dir depends on which Silo build is running:

```bash
# Production Silo
LIVE_DIR="$HOME/.config/silo/live-extensions"

# Dev build (pnpm dev)
LIVE_DIR="$HOME/.config/silo-dev/live-extensions"
```

Check which is running by probing (prefer the dir that exists):

```bash
if [ -d "$HOME/.config/silo-dev" ]; then
  LIVE_DIR="$HOME/.config/silo-dev/live-extensions"
else
  LIVE_DIR="$HOME/.config/silo/live-extensions"
fi
mkdir -p "$LIVE_DIR"
```

## Step 2 — Extension ID convention

Live extensions use the `live.*` namespace: `live.tasks`, `live.git-branch`, etc.
The bundle filename **must match** the extension id: `live.tasks.js` ↔ `id: "live.tasks"`.

## Step 3 — Source file shape

```tsx
// /tmp/silo-live-ext/<id>/src/index.tsx
import React, { useState, useEffect } from "react";
import type { Extension, SidePanelProps } from "@silo-code/sdk";
import { useServiceState } from "@silo-code/sdk";

export const extension: Extension = {
  id: "live.<slug>",
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

## Step 4 — package.json (needed for publishability)

```json
{
  "name": "silo-live-<slug>",
  "version": "0.1.0",
  "description": "...",
  "silo": {
    "id": "live.<slug>",
    "main": "dist/index.js",
    "publisher": "live"
  }
}
```

## Step 5 — Compile + Deploy (single Bash call)

```bash
# Resolve live-extensions dir
if [ -d "$HOME/.config/silo-dev" ]; then
  LIVE_DIR="$HOME/.config/silo-dev/live-extensions"
else
  LIVE_DIR="$HOME/.config/silo/live-extensions"
fi
mkdir -p "$LIVE_DIR"

ID="live.<slug>"
SRC="/tmp/silo-live-ext/$ID"

# Write source (already done in previous Write calls, or inline here)

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

echo "Deployed $ID — Silo will load it within ~200ms"
```

## Step 6 — Verify

Tell the user what appeared and where to look. There is no programmatic
verification — Silo is a production desktop app with no automation bridge.

Example (tailor to what was actually registered):

- **Status bar item**: "A clock now appears on the left side of the status bar."
- **Side panel**: "Open the left sidebar and click the Tasks icon to see the panel."
- **Command**: "Run it via the command palette (⌘K → 'Tasks: Add item')."

## Iteration

To **update** an extension: re-run the compile step. The old instance tears down and the new one loads within ~200ms.

To **unload** an extension: delete the file.

```bash
rm "$LIVE_DIR/live.<slug>.js"
```

## Publishing

Once the extension is working, it can be published for others to install:

1. Move source to a proper project directory
2. Add `dist/index.js` (the compiled bundle) to the package
3. Publish to npm: `npm publish`
4. Others install via the Extensions settings page input: `your-package-name`

---

## API Reference

### Registration — what `activate(ctx)` can register

**Commands** — named, invokable actions:

```typescript
ctx.registerCommand({ id: "live.foo.bar", label: "Foo: Do Bar", run: () => { ... } });
```

**Status bar items** — widgets in the strip at the bottom:

```typescript
ctx.registerStatusItem({
  id: "live.foo.status",
  alignment: "left" | "right",
  priority: 0, // lower = further left/right
  tooltip: "optional hover text",
  component: MyStatusWidget, // React component, no props
});
```

**Side panels** — left or right column panels:

```typescript
ctx.registerSidePanel({
  id: "live.foo.panel",
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
  id: "live.foo.settings",
  title: "My Settings",
  component: MySettings,
});
```

**Menu items** — entry in File/Edit/View/Window menu:

```typescript
ctx.registerMenuItem({
  id: "live.foo.item",
  menu: "file",
  command: "live.foo.bar",
  label: "...",
  group: "9_live",
});
```

**Keybindings** — keyboard shortcut:

```typescript
ctx.registerKeybinding({
  id: "live.foo.key",
  key: "cmd+shift+l",
  command: "live.foo.bar",
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

These trigger the full write → compile → deploy → verify loop:

**Git branch status bar:**

> `/live-extension` Create a status bar item on the left side that shows the current git branch for the active workspace, with a dot when there are uncommitted changes. Update when the active workspace switches.

**Workspace task list:**

> `/live-extension` Create a right-side panel called "Tasks" with a persistent to-do list. Items have a checkbox and a delete button. Persist tasks so they survive app restarts.

**GitHub issues panel:**

> `/live-extension` Create a right-side panel called "Issues" that fetches open GitHub issues for the active workspace's repo using `gh issue list --json number,title,url`. Show a refresh button and make each issue a clickable link. Load lazily on first open.

**Open PRs panel:**

> `/live-extension` Same as the Issues panel but for pull requests — call it "Pull Requests", use `gh pr list --json number,title,isDraft,url`, and dim draft PRs.

**Scratch pad:**

> `/live-extension` A right-side panel called "Scratch Pad" with a full-height textarea, persisted via storage so notes survive restarts. Use Silo's theme tokens for colors and the monospace font.

**Word count status bar:**

> `/live-extension` A right-aligned status bar item showing the word count of the currently active editor. Update when the active editor changes.
