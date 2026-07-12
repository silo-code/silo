# Interface: WebviewNavigateEvent

Defined in: [packages/sdk/src/webview-service.ts:34](https://github.com/silo-code/silo/blob/main/packages/sdk/src/webview-service.ts#L34)

One navigation event from [WebFrame.onNavigate](WebFrame.md#onnavigate).

## Properties

### type

```ts
type: WebviewNavType;
```

Defined in: [packages/sdk/src/webview-service.ts:36](https://github.com/silo-code/silo/blob/main/packages/sdk/src/webview-service.ts#L36)

The kind of navigation — see [WebviewNavType](../type-aliases/WebviewNavType.md).

***

### url

```ts
url: string;
```

Defined in: [packages/sdk/src/webview-service.ts:38](https://github.com/silo-code/silo/blob/main/packages/sdk/src/webview-service.ts#L38)

The frame's URL after the navigation.

***

### newDocument

```ts
newDocument: boolean;
```

Defined in: [packages/sdk/src/webview-service.ts:52](https://github.com/silo-code/silo/blob/main/packages/sdk/src/webview-service.ts#L52)

`true` on the first event reported by a freshly created document — i.e.
this event is the result of a full document load, whoever initiated it.
`false` for every subsequent event from the same document (SPA route
changes, the page's own `replaceState` calls, hash changes).

This matters because frameworks commonly call `history.replaceState`
while booting, so a single full-page navigation can report a `"replace"`
event *before* its `"load"`. Without this flag a consumer tracking its
own history stack can't tell that boot-time `"replace"` (a brand-new
page — usually a new history entry) apart from a genuine in-page
`replaceState` (rewrite the current entry).
