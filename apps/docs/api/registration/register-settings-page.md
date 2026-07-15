# ctx.registerSettingsPage

Add a page to the Settings dialog, listed in the left rail with optional `group` / `order`.

```ts
ctx.registerSettingsPage(page: SettingsPage): Disposable
```

## Example

```tsx
ctx.registerSettingsPage({
  id: "acme",
  title: "Acme",
  component: AcmeSettings, // a React component
});
```

Pass `badge` to render a small indicator after the title in the rail (e.g. an
update count) — its own component, so it can subscribe to reactive state and
update independently of the page's own render:

```tsx
ctx.registerSettingsPage({
  id: "acme",
  title: "Acme",
  component: AcmeSettings,
  badge: AcmeUpdateBadge, // e.g. renders a pill when updates are pending
});
```

## Types

Pass [`SettingsPage`](/api/types/interfaces/SettingsPage).

## See also

Other [Registration](/api/#registration) members on `ctx`.
