# Interface: AgentIcon

Defined in: [packages/sdk/src/agents-service.ts:273](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L273)

A Catalog Agent's brand mark — SVG path data plus the two theme-dependent
hexes. Consumed by [AgentIconGlyph](../functions/AgentIconGlyph.md); a single hex cannot have enough
contrast against both a light and a dark tab strip, so `"color"` mode picks
`hexLight` / `hexDark` by the host's active base.

## Properties

### title

```ts
title: string;
```

Defined in: [packages/sdk/src/agents-service.ts:275](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L275)

Display name, for the glyph's accessible label.

***

### hexLight

```ts
hexLight: string;
```

Defined in: [packages/sdk/src/agents-service.ts:277](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L277)

The brand's color against a light background, no leading `#`.

***

### hexDark

```ts
hexDark: string;
```

Defined in: [packages/sdk/src/agents-service.ts:279](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L279)

The brand's color against a dark background, no leading `#`.

***

### path

```ts
path: string;
```

Defined in: [packages/sdk/src/agents-service.ts:281](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L281)

SVG path data, `viewBox="0 0 24 24"`.

***

### fillRule?

```ts
optional fillRule?: "evenodd";
```

Defined in: [packages/sdk/src/agents-service.ts:284](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L284)

Set when the source path assumes `fill-rule: evenodd`; omit for the SVG
 default (`nonzero`).

***

### accentPath?

```ts
optional accentPath?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:287](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L287)

A second path (same viewBox) layered on [AgentIcon.path](#path) at 40%
 opacity, for a genuinely duotone mark (OpenCode's frame + inner panel).

***

### accentFillRule?

```ts
optional accentFillRule?: "evenodd";
```

Defined in: [packages/sdk/src/agents-service.ts:289](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L289)

`fill-rule` for [AgentIcon.accentPath](#accentpath), independent of `fillRule`.
