# Interface: WebFrame

Defined in: [packages/sdk/src/webview-service.ts:95](https://github.com/silo-code/silo/blob/main/packages/sdk/src/webview-service.ts#L95)

A live connection to an embedded frame's content, returned by
[WebviewService.attach](WebviewService.md#attach). Dispose it (or let `ctx.subscriptions`
dispose it) when your panel unmounts.

## Extends

- [`Disposable`](Disposable.md)

## Properties

### url

```ts
readonly url: string | null;
```

Defined in: [packages/sdk/src/webview-service.ts:97](https://github.com/silo-code/silo/blob/main/packages/sdk/src/webview-service.ts#L97)

The frame's current URL, updated on every [onNavigate](#onnavigate) event. `null` before the first load.

***

### onNavigate

```ts
onNavigate: Event<WebviewNavigateEvent>;
```

Defined in: [packages/sdk/src/webview-service.ts:99](https://github.com/silo-code/silo/blob/main/packages/sdk/src/webview-service.ts#L99)

Subscribe to in-frame navigation — the only way to track SPA route changes and full loads alike. See [WebviewNavType](../type-aliases/WebviewNavType.md).

***

### onBlocked

```ts
onBlocked: Event<void>;
```

Defined in: [packages/sdk/src/webview-service.ts:108](https://github.com/silo-code/silo/blob/main/packages/sdk/src/webview-service.ts#L108)

Fires when a navigation lands on what looks like a frame-blocked page —
sites sending `X-Frame-Options` / `frame-ancestors` don't error, WebKit
(and other engines) just commit an empty document at the target URL, so
this is a heuristic (empty title + no body content after load), not a
definitive diagnosis. Treat it as "this page probably won't work
embedded — offer to open it in a browser instead."

## Methods

### dispose()

```ts
dispose(): void;
```

Defined in: [packages/sdk/src/types.ts:61](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L61)

#### Returns

`void`

#### Inherited from

[`Disposable`](Disposable.md).[`dispose`](Disposable.md#dispose)

***

### back()

```ts
back(): void;
```

Defined in: [packages/sdk/src/webview-service.ts:110](https://github.com/silo-code/silo/blob/main/packages/sdk/src/webview-service.ts#L110)

Navigate the frame back in its history, if possible.

#### Returns

`void`

***

### forward()

```ts
forward(): void;
```

Defined in: [packages/sdk/src/webview-service.ts:112](https://github.com/silo-code/silo/blob/main/packages/sdk/src/webview-service.ts#L112)

Navigate the frame forward in its history, if possible.

#### Returns

`void`

***

### reload()

```ts
reload(): void;
```

Defined in: [packages/sdk/src/webview-service.ts:114](https://github.com/silo-code/silo/blob/main/packages/sdk/src/webview-service.ts#L114)

Reload the frame's current page.

#### Returns

`void`

***

### exec()

```ts
exec<T>(code): Promise<T>;
```

Defined in: [packages/sdk/src/webview-service.ts:123](https://github.com/silo-code/silo/blob/main/packages/sdk/src/webview-service.ts#L123)

Run JavaScript inside the frame and resolve with its result. A single
expression's value is returned (e.g. `"document.title"`,
`"location.href"`, `"document.querySelectorAll('a').length"`) — matching
how a devtools console evaluates. Multi-statement code runs but only
returns a value if it ends in an explicit `return`-compatible form.
The result must be structured-clone-safe (no DOM nodes, functions, etc.).

#### Type Parameters

##### T

`T` = `unknown`

#### Parameters

##### code

`string`

#### Returns

`Promise`\<`T`\>

***

### pickElement()

```ts
pickElement(): Promise<PickedElement | null>;
```

Defined in: [packages/sdk/src/webview-service.ts:130](https://github.com/silo-code/silo/blob/main/packages/sdk/src/webview-service.ts#L130)

Enter interactive element-pick mode: the user hovers to highlight and
clicks to select, or presses Escape to cancel. Resolves with the picked
element, or `null` if cancelled. No timeout — this is inherently
user-paced.

#### Returns

`Promise`\<[`PickedElement`](PickedElement.md) \| `null`\>

***

### cancelPick()

```ts
cancelPick(): void;
```

Defined in: [packages/sdk/src/webview-service.ts:137](https://github.com/silo-code/silo/blob/main/packages/sdk/src/webview-service.ts#L137)

Cancel an in-flight [pickElement](#pickelement) call — exits pick mode in the
frame and resolves the pending `pickElement()` promise with `null`. A
no-op if no pick is active (including if it already ended, e.g. via
Escape or a click).

#### Returns

`void`

***

### capture()

```ts
capture(): Promise<Blob>;
```

Defined in: [packages/sdk/src/webview-service.ts:139](https://github.com/silo-code/silo/blob/main/packages/sdk/src/webview-service.ts#L139)

A native PNG snapshot of the frame's current visible viewport.

#### Returns

`Promise`\<`Blob`\>

***

### captureRect()

```ts
captureRect(rect): Promise<Blob>;
```

Defined in: [packages/sdk/src/webview-service.ts:141](https://github.com/silo-code/silo/blob/main/packages/sdk/src/webview-service.ts#L141)

A native PNG snapshot of a frame-relative sub-rect — e.g. a [PickedElement.rect](PickedElement.md#rect) or a marquee selection.

#### Parameters

##### rect

[`WebviewRect`](WebviewRect.md)

#### Returns

`Promise`\<`Blob`\>

***

### captureFullPage()

```ts
captureFullPage(): Promise<Blob>;
```

Defined in: [packages/sdk/src/webview-service.ts:143](https://github.com/silo-code/silo/blob/main/packages/sdk/src/webview-service.ts#L143)

A native PNG snapshot of the frame's entire scrollable document, stitched from scrolled captures. Scroll position is restored afterward.

#### Returns

`Promise`\<`Blob`\>
