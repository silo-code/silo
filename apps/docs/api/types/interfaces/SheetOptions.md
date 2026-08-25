# Interface: SheetOptions

Defined in: [packages/sdk/src/layout-service.ts:40](https://github.com/silo-code/silo/blob/main/packages/sdk/src/layout-service.ts#L40)

Options for [LayoutService.openPanelSheet](LayoutService.md#openpanelsheet).

## Properties

### title?

```ts
optional title?: ReactNode;
```

Defined in: [packages/sdk/src/layout-service.ts:42](https://github.com/silo-code/silo/blob/main/packages/sdk/src/layout-service.ts#L42)

Header rendered at the top of the sheet; omit for a bare surface.

***

### width?

```ts
optional width?: number;
```

Defined in: [packages/sdk/src/layout-service.ts:44](https://github.com/silo-code/silo/blob/main/packages/sdk/src/layout-service.ts#L44)

Width in CSS px. Omit for the default (~520px).

***

### bare?

```ts
optional bare?: boolean;
```

Defined in: [packages/sdk/src/layout-service.ts:49](https://github.com/silo-code/silo/blob/main/packages/sdk/src/layout-service.ts#L49)

Skip the sheet's own header and body padding — your content *is* the
surface, and owns its own chrome (including a close affordance).

***

### className?

```ts
optional className?: string;
```

Defined in: [packages/sdk/src/layout-service.ts:51](https://github.com/silo-code/silo/blob/main/packages/sdk/src/layout-service.ts#L51)

Extra class on the sheet surface.

***

### ariaLabel?

```ts
optional ariaLabel?: string;
```

Defined in: [packages/sdk/src/layout-service.ts:53](https://github.com/silo-code/silo/blob/main/packages/sdk/src/layout-service.ts#L53)

Accessible name for a sheet without a visible [SheetOptions.title](#title).

***

### mode?

```ts
optional mode?: "overlay" | "push";
```

Defined in: [packages/sdk/src/layout-service.ts:58](https://github.com/silo-code/silo/blob/main/packages/sdk/src/layout-service.ts#L58)

`"overlay"` covers the center dock, `"push"` narrows it so the sheet
takes real layout space. Default `"overlay"`.
