# Interface: PickedElement

Defined in: [packages/sdk/src/webview-service.ts:64](https://github.com/silo-code/silo/blob/main/packages/sdk/src/webview-service.ts#L64)

The result of [WebFrame.pickElement](WebFrame.md#pickelement) — what the user clicked while
picking.

## Properties

### selector

```ts
selector: string;
```

Defined in: [packages/sdk/src/webview-service.ts:66](https://github.com/silo-code/silo/blob/main/packages/sdk/src/webview-service.ts#L66)

A CSS selector breadcrumb from `<html>` down to the clicked element (tag + up to 2 classes per level).

***

### text

```ts
text: string;
```

Defined in: [packages/sdk/src/webview-service.ts:68](https://github.com/silo-code/silo/blob/main/packages/sdk/src/webview-service.ts#L68)

The element's trimmed text content, truncated to 200 characters.

***

### rect

```ts
rect: WebviewRect;
```

Defined in: [packages/sdk/src/webview-service.ts:70](https://github.com/silo-code/silo/blob/main/packages/sdk/src/webview-service.ts#L70)

The element's frame-relative bounding rect — pass to [WebFrame.captureRect](WebFrame.md#capturerect) to screenshot just this element.
