# Interface: WebviewService

Defined in: [packages/sdk/src/webview-service.ts:171](https://github.com/silo-code/silo/blob/main/packages/sdk/src/webview-service.ts#L171)

The webview-bridge domain, exposed as [ExtensionContext.webview](ExtensionContext.md#webview).
Requires the `"webview"` [Permission](../type-aliases/Permission.md).

## Example

```tsx
function MyPanel({ ctx }: { ctx: ExtensionContext }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const frameRef = useRef<WebFrame | null>(null);

  useEffect(() => {
    if (!iframeRef.current) return;
    const frame = ctx.webview.attach(iframeRef.current);
    frameRef.current = frame;
    const sub = frame.onNavigate((e) => console.log(e.type, e.url));
    return () => { sub.dispose(); frame.dispose(); };
  }, []);

  return <iframe ref={iframeRef} src="https://example.com" />;
}
```

## Methods

### attach()

```ts
attach(frame): WebFrame;
```

Defined in: [packages/sdk/src/webview-service.ts:177](https://github.com/silo-code/silo/blob/main/packages/sdk/src/webview-service.ts#L177)

Attach the bridge to an iframe your panel owns. The iframe can be
cross-origin — that's the point. Returns a [WebFrame](WebFrame.md); call
`.dispose()` (or push it onto `ctx.subscriptions`) when done with it.

#### Parameters

##### frame

`HTMLIFrameElement`

#### Returns

[`WebFrame`](WebFrame.md)
