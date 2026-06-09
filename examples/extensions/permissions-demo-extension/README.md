# Permissions Demo

A small, honest demonstration of Silo's **workspace path-scoping** and the
**`fs:read` capability** ([ADR 0015](../../../docs/decisions/0015-phased-security-model.md),
[Permissions & access guide](../../../apps/docs/guide/permissions.md)).

It declares one permission in its manifest:

```jsonc
"silo": {
  "id": "acme.permissions-demo",
  "permissions": ["fs:read"], // ← this is why installing it shows a consent prompt
}
```

Because it asks for access beyond the workspace, **installing it pops the consent
dialog** — "Permissions Demo is requesting access → Read files outside the current
workspace". That prompt is the whole point: it's the one part of the flow you have
to see for yourself.

## What it does

Adds a **🔐 Permissions Demo** button to the status bar (and a
`Permissions Demo: Run scope checks` command). Clicking it runs three filesystem
operations through `ctx.files` and toasts what the scope allowed:

| Operation                                | Expected result                                           |
| ---------------------------------------- | --------------------------------------------------------- |
| Read **inside** the workspace (`.`)      | ✅ allowed — every extension can reach the open workspace |
| Read **outside** the workspace (`/tmp`)  | ✅ allowed **because** it holds `fs:read`                 |
| Write **outside** the workspace (`/tmp`) | ✅ correctly blocked — it never asked for `fs:write`      |

The operations are deliberately benign (directory listings and a throwaway
write). The goal is to show the boundary and what a grant lifts — not to probe
around it.

## Honest scope

This is JS-side enforcement at the `ctx` chokepoint: \*\*honest-mistake containment

- consent + audit, not a sandbox.\*\* In-realm code can bypass `ctx` entirely until
  sandboxed execution lands — see
  [RFC 0006](../../../docs/proposals/0006-extension-permissions-sandbox.md). Install
  extensions you trust.

This is a **teaching example**, not the starter template — a starter should be
permission-free so it installs without a prompt.

## Build & install

```sh
pnpm install
pnpm --filter permissions-demo-extension build   # produces dist/index.js
```

Then in Silo: **Settings → Extensions → Install from folder…** and choose this
folder. Approve the consent prompt, then click **🔐 Permissions Demo** in the
status bar.
