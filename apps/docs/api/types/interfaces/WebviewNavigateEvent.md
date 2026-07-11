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
