# Interface: WebviewRect

Defined in: [packages/sdk/src/webview-service.ts:50](https://github.com/silo-code/silo/blob/main/packages/sdk/src/webview-service.ts#L50)

A rectangle in frame-relative CSS pixels — the coordinate space
`getBoundingClientRect()` returns inside the frame's own document. Used by
[WebFrame.captureRect](WebFrame.md#capturerect) (e.g. for a picked element or a marquee
selection) and returned as part of [PickedElement](PickedElement.md).

## Properties

### x

```ts
x: number;
```

Defined in: [packages/sdk/src/webview-service.ts:51](https://github.com/silo-code/silo/blob/main/packages/sdk/src/webview-service.ts#L51)

***

### y

```ts
y: number;
```

Defined in: [packages/sdk/src/webview-service.ts:52](https://github.com/silo-code/silo/blob/main/packages/sdk/src/webview-service.ts#L52)

***

### width

```ts
width: number;
```

Defined in: [packages/sdk/src/webview-service.ts:53](https://github.com/silo-code/silo/blob/main/packages/sdk/src/webview-service.ts#L53)

***

### height

```ts
height: number;
```

Defined in: [packages/sdk/src/webview-service.ts:54](https://github.com/silo-code/silo/blob/main/packages/sdk/src/webview-service.ts#L54)
