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

## Types

Pass [`SettingsPage`](/api/types/interfaces/SettingsPage).

## See also

Other [Registration](/api/#registration) members on `ctx`.
