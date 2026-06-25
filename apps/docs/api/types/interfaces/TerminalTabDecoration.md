# Interface: TerminalTabDecoration

Defined in: [packages/sdk/src/terminal-service.ts:36](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L36)

A decoration that an extension can attach to a terminal tab — a small icon
with an optional tooltip and semantic color. Registered via
[TerminalService.registerTabDecoration](TerminalService.md#registertabdecoration).

## Properties

### icon

```ts
icon: ReactNode;
```

Defined in: [packages/sdk/src/terminal-service.ts:42](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L42)

Small React node rendered as a decoration badge on the tab (≤16 px).
The extension supplies the shape; the host applies `color` via a CSS
data attribute mapped to design tokens.

***

### tooltip?

```ts
optional tooltip?: string;
```

Defined in: [packages/sdk/src/terminal-service.ts:44](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L44)

Tooltip shown when hovering the decoration icon.

***

### color?

```ts
optional color?: "ok" | "warn" | "error" | "accent" | "muted";
```

Defined in: [packages/sdk/src/terminal-service.ts:49](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L49)

Semantic color applied to the icon element. The host maps this to the
matching `--silo-color-*` design token so themes control the exact shade.
