# Interface: PickedElement

Defined in: [packages/sdk/src/webview-service.ts:78](https://github.com/silo-code/silo/blob/main/packages/sdk/src/webview-service.ts#L78)

The result of [WebFrame.pickElement](WebFrame.md#pickelement) — what the user clicked while
picking.

## Properties

### selector

```ts
selector: string;
```

Defined in: [packages/sdk/src/webview-service.ts:80](https://github.com/silo-code/silo/blob/main/packages/sdk/src/webview-service.ts#L80)

A CSS selector breadcrumb from `<html>` down to the clicked element (tag + up to 2 classes per level).

***

### text

```ts
text: string;
```

Defined in: [packages/sdk/src/webview-service.ts:82](https://github.com/silo-code/silo/blob/main/packages/sdk/src/webview-service.ts#L82)

The element's trimmed text content, truncated to 200 characters.

***

### rect

```ts
rect: WebviewRect;
```

Defined in: [packages/sdk/src/webview-service.ts:84](https://github.com/silo-code/silo/blob/main/packages/sdk/src/webview-service.ts#L84)

The element's frame-relative bounding rect — pass to [WebFrame.captureRect](WebFrame.md#capturerect) to screenshot just this element.
