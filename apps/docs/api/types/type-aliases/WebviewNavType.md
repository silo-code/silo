# Type Alias: WebviewNavType

```ts
type WebviewNavType = "push" | "replace" | "pop" | "load" | "hash";
```

Defined in: [packages/sdk/src/webview-service.ts:26](https://github.com/silo-code/silo/blob/main/packages/sdk/src/webview-service.ts#L26)

The kind of in-frame navigation reported by [WebFrame.onNavigate](../interfaces/WebFrame.md#onnavigate).

- `"load"` — a full document load (the initial navigation, or any
  non-SPA link click / `location.href` assignment).
- `"push"` / `"replace"` — `history.pushState` / `history.replaceState`,
  the SPA route-change primitives (React Router, Vue Router, etc.).
- `"pop"` — a `popstate` event (back/forward within the SPA).
- `"hash"` — a `hashchange` event.
