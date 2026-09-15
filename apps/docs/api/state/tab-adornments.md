# Tab adornments (CenterDock)

Ephemeral chrome on **editor**, **terminal**, and **panel** tabs — leading
identity icons, trailing Phosphor indicators, a whole-tab highlight, and
host-owned **Activity**. Uses the **adorn**
metaphor (`set` / `clear` / `flash` / `bind`), not `register*`. See
[ADR 0029](https://github.com/silo-code/silo/blob/main/docs/decisions/0029-adornments-vs-registration.md)
and [ADR 0030](https://github.com/silo-code/silo/blob/main/docs/decisions/0030-activity-chrome.md).

There is **no** `ctx.tabs` bag and **no** shared API with future side-panel tab
chrome ([RFC 0022](https://github.com/silo-code/silo/blob/main/docs/proposals/0022-side-panel-tab-adornments.md)).

## Surfaces

| Service                                 | Target id                                                                                           |
| --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [`ctx.editors`](/api/editors/)          | Editor tab id                                                                                       |
| [`ctx.terminals`](/api/state/terminals) | Terminal session id                                                                                 |
| [`ctx.panels`](/api/state/panels)       | Panel's dockview id — [`DockPanelRecord.panelId`](/api/types/interfaces/DockPanelRecord) (RFC 0046) |

All three expose the same verbs via [`TabAdornmentMethods`](/api/types/interfaces/TabAdornmentMethods).

### A panel tab shouldn't paint its own chrome

`ctx.panels` targets a panel by its own id, the same way `ctx.editors` /
`ctx.terminals` target theirs — ordinary third-party adornment, the same
shape `registerContextMenuItem({ surface: "panel/tab" })` and
`registerToolbarItem({ surface: "panel" })` already use to act on a panel by
that same id (RFC 0046).

What's still a real anti-pattern: a panel adorning **its own** tab from
inside itself, based on its own internal state. That sits outside whatever
settings and policy some other extension owns for that chrome, and two
extensions doing it to the same tab collide (at most one highlight wins).
Prefer declaring what the panel is showing and letting an ordinary binder
reach it from the outside — today that's Agent Sessions:

```tsx
function ChatPanel({ api }: DockPanelProps) {
  useEffect(() => {
    // "this tab is that Agent Session" — and nothing more
    api.setAgentSession(sessionId);
    return () => api.setAgentSession(null);
  }, [api, sessionId]);
}
```

From there [`ctx.agents.bindActivity` / `bindIcon`](/api/agents/) — which take
an **Agent Session id**, not a tab id — badge this tab exactly as they badge a
terminal tab running the same agent. The declaration is withdrawn automatically
on unmount. An extension with no such indirection available — e.g. it's
adorning an arbitrary tab a user flagged, regardless of kind — binds on
`ctx.panels` directly by panel id instead, same as it already would for an
editor or terminal tab.

## Leading icon (`ReactNode`)

```ts
ctx.editors.setIcon(editorId, { id: "acme.logo", icon: <Logo /> });
ctx.editors.clearIcon(editorId, "acme.logo");

ctx.subscriptions.push(
  ctx.editors.bindIcon({
    id: "acme.logo",
    provide: (editorId) =>
      acmeStore.hasLogo(editorId) ? { icon: <Logo /> } : null,
  }),
);
```

## Tab highlight

Paint a soft tinted highlight across the **entire tab** — icon, title text,
and every other adornment — via optional semantic `color`. Distinct from the
leading icon and trailing indicator, which tint only their own glyph.
Contributing one (via `set`, or a `bind` whose `provide` returns non-`null`)
is itself the on/off signal — there's no separate boolean. At most one
highlight renders per tab; if multiple extensions contribute one for the
same target, the first found (`set`, then `bind`, in registration order)
wins.

```ts
ctx.editors.setHighlight(editorId, { id: "acme.title", color: "warn" });
ctx.editors.clearHighlight(editorId, "acme.title");

ctx.subscriptions.push(
  ctx.terminals.bindHighlight({
    id: "acme.title",
    provide: (terminalId) =>
      acmeStore.isFlagged(terminalId) ? { color: "accent" } : null,
  }),
);
```

## Trailing indicator (static Phosphor)

You pick a [`PhosphorIconName`](/api/types/type-aliases/PhosphorIconName)
(+ optional `filled` / `chip` / `color`). For busy/ready/warn/error chrome use
**Activity** instead.

```ts
ctx.terminals.setIndicator(terminalId, {
  id: "acme.flag",
  icon: "Flag",
  chip: true,
  color: "warn",
});
ctx.terminals.clearIndicator(terminalId, "acme.flag");
```

## Activity (host-owned)

Pick an [`Activity`](/api/types/type-aliases/Activity) — `"working"` | `"ready"` |
`"warn"` | `"error"`. The host owns glyph, color, and motion (same dots as
workspace status rows; tabs use a slightly larger size). Do **not** pass
`icon` or `color`.

```ts
ctx.subscriptions.push(
  ctx.terminals.bindActivity({
    id: "acme.busy",
    provide: (terminalId) =>
      acmeStore.isBusy(terminalId)
        ? { activity: "working", tooltip: "Working" }
        : null,
  }),
);

ctx.editors.flashActivity(editorId, {
  activity: "error",
  durationMs: 800,
});

// After mutating store read by binders:
ctx.terminals.invalidateTabAdornments();
```

Use the SDK [`ActivityGlyph`](/design/components/activity) in your own panels
when you want the same glyph (Design System page).

## Deprecated shims

`ctx.terminals.registerTabDecoration` / `invalidateTabDecorations` /
`subscribeTabDecorations` / `getTabDecoration` remain as thin deprecated
wrappers over `bindIndicator` / `invalidateTabAdornments` for extensions that
shipped against the older terminal-only API.

## Types

[`TabIconAdornment`](/api/types/interfaces/TabIconAdornment) ·
[`TabHighlightAdornment`](/api/types/interfaces/TabHighlightAdornment) ·
[`TabIndicatorAdornment`](/api/types/interfaces/TabIndicatorAdornment) ·
[`TabActivityAdornment`](/api/types/interfaces/TabActivityAdornment) ·
[`TabIconBinder`](/api/types/interfaces/TabIconBinder) ·
[`TabHighlightBinder`](/api/types/interfaces/TabHighlightBinder) ·
[`TabIndicatorBinder`](/api/types/interfaces/TabIndicatorBinder) ·
[`TabActivityBinder`](/api/types/interfaces/TabActivityBinder) ·
[`TabAdornmentColor`](/api/types/type-aliases/TabAdornmentColor) ·
[`Activity`](/api/types/type-aliases/Activity)

## See also

- [Activity](/design/components/activity) — `ActivityGlyph` in panel content
- [`ctx.panels`](/api/state/panels) — the same verbs for a dock panel tab of any kind
- [`registerToolbarItem`](/api/registration/register-toolbar-item) — active toggle in the breadcrumb bar.
- [`ctx.workspaces` status / badges](/api/state/workspaces) — adorn verbs; status rows use `activity`.
- [ADR 0029](https://github.com/silo-code/silo/blob/main/docs/decisions/0029-adornments-vs-registration.md) ·
  [ADR 0030](https://github.com/silo-code/silo/blob/main/docs/decisions/0030-activity-chrome.md)
