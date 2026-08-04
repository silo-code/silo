# Tab adornments (CenterDock)

Ephemeral chrome on **editor** and **terminal** tabs — leading identity icons,
trailing Phosphor indicators, and host-owned **Activity**. Uses the **adorn**
metaphor (`set` / `clear` / `flash` / `bind`), not `register*`. See
[ADR 0029](https://github.com/silo-code/silo/blob/main/docs/decisions/0029-adornments-vs-registration.md)
and [ADR 0030](https://github.com/silo-code/silo/blob/main/docs/decisions/0030-activity-chrome.md).

There is **no** `ctx.tabs` bag and **no** shared API with future side-panel tab
chrome ([RFC 0022](https://github.com/silo-code/silo/blob/main/docs/proposals/0022-side-panel-tab-adornments.md)).

## Surfaces

| Service                                 | Target id           |
| --------------------------------------- | ------------------- |
| [`ctx.editors`](/api/editors/)          | Editor tab id       |
| [`ctx.terminals`](/api/state/terminals) | Terminal session id |

Both expose the same verbs via [`TabAdornmentMethods`](/api/types/interfaces/TabAdornmentMethods).

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
- [`registerToolbarItem`](/api/registration/register-toolbar-item) — active toggle in the breadcrumb bar.
- [`ctx.workspaces` status / badges](/api/state/workspaces) — adorn verbs; status rows use `activity`.
- [ADR 0029](https://github.com/silo-code/silo/blob/main/docs/decisions/0029-adornments-vs-registration.md) ·
  [ADR 0030](https://github.com/silo-code/silo/blob/main/docs/decisions/0030-activity-chrome.md)
