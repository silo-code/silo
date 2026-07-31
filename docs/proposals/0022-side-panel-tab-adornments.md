---
status: draft
created: 2026-07-31
---

# 0022. Side-panel tab adornments (owner handle)

## Summary

Let a side panel’s **owning extension** put a thin trailing **Activity** (and
optionally a static Phosphor indicator) on that panel’s SideDock tab — via a
handle returned from `registerSidePanel`, not a shared center-dock adorn API
and not a `panelId` free-for-all for other extensions.

## Motivation

CenterDock tabs (editors / terminals) need rich adornments: leading ReactNode
identity icons, trailing Phosphor indicators, Activity, multi-contributor
stacking, `flash`, and `bind`. SideDock tabs are different:

- One tab per registered panel; identity already comes from `SidePanel.title`
  (and any future static icon on the contribution).
- The usual need is “my panel is working / has a warning” — the **owner** knows.
- Cross-extension adornment of someone else’s side tab is rare and would invite
  the full center-dock surface onto a simpler chrome.

ADR 0029 deliberately kept side-panel tab chrome **out** of
`ctx.editors` / `ctx.terminals` and rejected a shared `ctx.tabs` + `TabRef`.
ADR 0030 makes Activity the shared busy/ready/warn/error language. This RFC
designs the thinner follow-up.

## Design

### Return type of `registerSidePanel`

Expand the disposable returned by `ctx.registerSidePanel` (still tracked on
`ctx.subscriptions`):

```ts
interface SidePanelTabAdornment {
  /** Host-owned activity glyph on this panel’s SideDock tab. */
  setActivity(adornment: { activity: Activity; tooltip?: string }): void;
  clearActivity(): void;
}

type SidePanelRegistration = Disposable & SidePanelTabAdornment;

const panel = ctx.registerSidePanel({ id: "silo.git", ... });
panel.setActivity({ activity: "working", tooltip: "Fetching" });
panel.clearActivity();
```

Singular activity only (no stacking / bind / flash unless a later need appears).
Reuse the SDK `<Activity size="md" />` paint (ADR 0030).

### Deliberate thinness (vs center)

|                  | Center (`editors` / `terminals`) | Side (this RFC)                            |
| ---------------- | -------------------------------- | ------------------------------------------ |
| Who              | Any extension → any tab id       | **Owner only** (handle from register)      |
| Leading icon     | `setIcon` (ReactNode)            | **None** — contribution owns identity      |
| Activity         | Multi-id stack + bind + flash    | **Single** `setActivity` / `clearActivity` |
| Static indicator | Multi-id stack + bind + flash    | Deferred unless needed                     |
| Target key       | Editor / session instance id     | Implied by the registration                |

### Host paint

[`PanelPane`](../../packages/extension-host/src/layout/PanelPane.tsx) already
renders a tab strip per side slot (one tab per `SidePanel.id`). When
implementing: store at most one activity per panel id; paint with
`<Activity activity={…} size="md" />`.

### Lifecycle

- `dispose` on the registration clears activity and unregisters the panel
  (existing dispose behavior).
- Reloading / deactivating the extension disposes subscriptions → chrome clears.

## Alternatives considered

- **Shared `ctx.tabs` + `{ dock: "side", panelId }`** — rejected in ADR 0029;
  couples APIs and invites non-owners to adorn arbitrary panels.
- **`ctx.layout.setSidePanelActivity(panelId, …)`** — no new property, but
  stretches “layout” into chrome and allows cross-extension targeting.
- **Full center parity on the handle** (`bind` / `flash` / leading icon) —
  deferred until a concrete product need appears.
- **Owner `setIndicator` with tab animations** — superseded by ADR 0030 Activity.

## Decision

Filled in when the RFC leaves `draft`. Crystallizing ADR (if needed) will
cross-link ADR 0029 / 0030.
