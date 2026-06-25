# Workspace Section Demo — an example Silo extension

A minimal example demonstrating **`ctx.workspaces.registerSection()`** — the
API that lets extensions mount a React component inside workspace rows in the
Workspaces side panel.

This extension renders a small "Terminals" summary card below each workspace's
path line, listing the workspace's open terminal names. For workspaces with no
terminals the component returns `null` — no DOM node, no visual gap.

## What it shows

- **`registerSection`** — register a React component as a workspace row section
- **`return null`** — the clean way to opt out for a specific workspace
- **Reactive updates** — subscribe to `ctx.workspaces.subscribe()` inside the
  component so it stays current when terminals open or close
- **Design tokens** — all CSS uses `--silo-*` tokens so the section themes and
  scales correctly

## Build

```sh
npm install
npm run build      # → dist/index.js
```

`@silo-code/sdk` is a **devDependency** (types only, never bundled). The build
externalises `react`, `react/jsx-runtime`, and `@silo-code/sdk` so the host
resolves them at load time — one React instance, no hook mismatches.

See [`../clock-extension`](../clock-extension) for a walkthrough of the build
setup and manifest fields.

## Install

In Silo, open **Settings → Extensions → Install from folder…** and choose this
folder. Each workspace row with open terminals will show a bordered terminals
summary card; rows without terminals remain unchanged.

## The section API

```tsx
ctx.subscriptions.push(
  ctx.workspaces.registerSection({
    id: "my-ext.section", // unique id, conventionally "<ext-id>.section"
    component: MySection, // React.ComponentType<{ workspaceId: string }>
    order: 0, // lower = higher in the stack, default 0
  }),
);
```

The component receives `{ workspaceId: string }`. Return `null` for workspaces
where the section should not appear. Multiple sections from different extensions
stack vertically in ascending `order`.
