# ctx.panels

Tab chrome — leading icon, whole-tab highlight, trailing indicator, and
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

On [`ctx.panels`](/api/types/interfaces/PanelService) — full verb family
documented in [Tab adornments](/api/state/tab-adornments).

| Method                                                                                                       | What it does                        |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| [`setActivity` / `clearActivity` / `flashActivity` / `bindActivity`](/api/types/interfaces/PanelService)     | Host-owned Activity (ADR 0030)      |
| [`setIndicator` / `clearIndicator` / `flashIndicator` / `bindIndicator`](/api/types/interfaces/PanelService) | Trailing static Phosphor indicators |
| [`setHighlight` / `clearHighlight` / `bindHighlight`](/api/types/interfaces/PanelService)                    | Whole-tab tinted highlight          |
| [`setIcon` / `clearIcon` / `bindIcon`](/api/types/interfaces/PanelService)                                   | Leading ReactNode icons             |
| [`invalidateTabAdornments`](/api/types/interfaces/PanelService#invalidatetabadornments)                      | Re-query binders                    |

## See also

- [Tab adornments](/api/state/tab-adornments) — the shared verb family, full
  reference, and the self-adornment caveat.
- [`ctx.editors`](/api/editors/) · [`ctx.terminals`](/api/state/terminals) —
  the same chrome, scoped to their own kind.
