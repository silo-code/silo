# ctx.panels

Tab chrome — leading icon, tab highlight, trailing indicator, and
host-owned Activity — for a dock panel tab of **any** `DockPanelKind` (RFC
0046): the bundled Chat transcript, a web viewer, a third-party panel. Mirrors
[`ctx.editors`](/api/editors/) and [`ctx.terminals`](/api/state/terminals),
which offer the same verbs scoped to their own kind — a panel tab is a
first-class third citizen for this chrome, not a special case you work around.

```ts
ctx.panels: PanelService
```

Target id is the panel's own dockview id — the same string a `"panel/tab"`
context-menu hit or a `"panel"` toolbar hit carries as `panelId`
(see [`registerContextMenuItem`](/api/registration/register-context-menu-item)
and [`registerToolbarItem`](/api/registration/register-toolbar-item)), so an
extension already handling one of those needs no translation to adorn the same
tab.

## Finding a panel to adorn

If you're starting from a workspace rather than from a menu invocation, read
[`Workspace.panels`](/api/types/interfaces/Workspace) and use each record's
[`panelId`](/api/types/interfaces/DockPanelRecord):

```ts
for (const panel of ws.panels) {
  if (panel.kindId !== "silo.agents-chat-panel") continue;
  ctx.panels.setIndicator(panel.panelId, { id: "acme.watching", icon: "Eye" });
}
```

`panelId` is not `DockPanelRecord.id` — `id` is the record's persisted
identity, `panelId` is the live tab's. Read `panelId`; don't build it out of
the record's other fields. Its format is host-owned and can change.

A transient panel (one whose kind didn't declare `persistence: "recorded"`)
has no record and so is absent from `Workspace.panels`, but it can still be
adorned by id if you learn its id another way — e.g. from a `"panel/tab"` menu
invocation.

## Example

```ts
ctx.subscriptions.push(
  ctx.panels.bindHighlight({
    id: "acme.follow-up",
    provide: (panelId) =>
      acmeStore.isFlagged(panelId) ? { color: "warn" } : null,
  }),
);

ctx.panels.invalidateTabAdornments();
```

## Methods

On [`ctx.panels`](/api/types/interfaces/PanelService) — full adornment verb
family documented in [Tab adornments](/api/state/tab-adornments).

| Method                                                                                                       | What it does                                                                       |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| [`focus(panelId)`](/api/types/interfaces/PanelService#focus)                                                 | Switch to the panel's workspace and bring its tab to front. No-op for unknown ids. |
| [`getState()` / `subscribe(listener)`](/api/types/interfaces/PanelService#getstate)                          | The active panel, or `null` — see [Active panel](#active-panel) below.             |
| [`setActivity` / `clearActivity` / `flashActivity` / `bindActivity`](/api/types/interfaces/PanelService)     | Host-owned Activity (ADR 0030)                                                     |
| [`setIndicator` / `clearIndicator` / `flashIndicator` / `bindIndicator`](/api/types/interfaces/PanelService) | Trailing static Phosphor indicators                                                |
| [`setHighlight` / `clearHighlight` / `bindHighlight`](/api/types/interfaces/PanelService)                    | Tinted tab highlight                                                               |
| [`setIcon` / `clearIcon` / `bindIcon`](/api/types/interfaces/PanelService)                                   | Leading ReactNode icons                                                            |
| [`invalidateTabAdornments`](/api/types/interfaces/PanelService#invalidatetabadornments)                      | Re-query binders                                                                   |

`focus(panelId)` takes the same live dockview panel id as the adornment
methods above — the `panelId` a [`"panel/tab"`](/api/registration/register-context-menu-item)
or [`"panel"`](/api/registration/register-toolbar-item) hit carries, or a
[`DockPanelRecord.panelId`](/api/types/interfaces/DockPanelRecord) read off
[`Workspace.panels`](/api/types/interfaces/Workspace). Mirrors
[`ctx.terminals.focus`](/api/state/terminals#methods) and
[`ctx.editors.focus`](/api/editors/#methods).

## Active panel

Track whether a non-editor/non-terminal `DockPanelKind` tab is the one the
user is looking at. `getState()` is `null` whenever the active center-dock tab
is the built-in editor or terminal — the same kind isolation the adornment
methods above already enforce — so you never get a false positive from
"neither editor nor terminal is active, so it must be this panel."

`ctx.panels` satisfies [`ReactiveService<ActivePanelInfo | null>`](/api/types/interfaces/ReactiveService),
so `useServiceState(ctx.panels)` works the same way it does for
[`ctx.editors`](/api/editors/) and [`ctx.terminals`](/api/state/terminals):

```ts
import { useServiceState } from "@silo-code/sdk";

function FollowUpRow({ ctx, record }: { ctx: ExtensionContext; record: DockPanelRecord }) {
  const active = useServiceState(ctx.panels);
  const isCurrent = active?.recordId === record.id;
  return <Row current={isCurrent} />;
}
```

[`ActivePanelInfo`](/api/types/interfaces/ActivePanelInfo) carries `panelId`,
`kindId`, `workspaceId`, and — for a `persistence: "recorded"` kind —
`recordId`, the same id [`Workspace.panels`](/api/types/interfaces/Workspace)
enumerates. `recordId` is `undefined` for a transient kind, which has no
record to name.

## See also

- [Tab adornments](/api/state/tab-adornments) — the shared verb family, full
  reference, and the self-adornment caveat.
- [`ctx.editors`](/api/editors/) · [`ctx.terminals`](/api/state/terminals) —
  the same chrome, scoped to their own kind, and the same active-tab pattern.
