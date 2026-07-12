# Interface: WebviewRect

Defined in: [packages/sdk/src/webview-service.ts:64](https://github.com/silo-code/silo/blob/main/packages/sdk/src/webview-service.ts#L64)

A rectangle in frame-relative CSS pixels — the coordinate space
`getBoundingClientRect()` returns inside the frame's own document. Used by
[WebFrame.captureRect](WebFrame.md#capturerect) (e.g. for a picked element or a marquee
selection) and returned as part of [PickedElement](PickedElement.md).

## Properties

### x

```ts
x: number;
```

Defined in: [packages/sdk/src/webview-service.ts:65](https://github.com/silo-code/silo/blob/main/packages/sdk/src/webview-service.ts#L65)

***

### y

```ts
y: number;
```

Defined in: [packages/sdk/src/webview-service.ts:66](https://github.com/silo-code/silo/blob/main/packages/sdk/src/webview-service.ts#L66)

***

### width

```ts
width: number;
```

Defined in: [packages/sdk/src/webview-service.ts:67](https://github.com/silo-code/silo/blob/main/packages/sdk/src/webview-service.ts#L67)

***

### height

```ts
height: number;
```

Defined in: [packages/sdk/src/webview-service.ts:68](https://github.com/silo-code/silo/blob/main/packages/sdk/src/webview-service.ts#L68)
