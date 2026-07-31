# Type Alias: PhosphorIconName

```ts
type PhosphorIconName = string;
```

Defined in: [packages/sdk/src/phosphor-icon.ts:14](https://github.com/silo-code/silo/blob/main/packages/sdk/src/phosphor-icon.ts#L14)

Export name of an icon from `@phosphor-icons/react` — e.g. `"Flag"`,
`"ArrowClockwise"`, `"PushPin"`. The host resolves the name and paints it:
toolbar chrome uses `weight="bold"`; tab decorations use `weight="regular"`
by default (`filled: true` → `weight="fill"`); both use `size="1em"` so
glyphs track UI zoom.

Use the PascalCase component name from
[Phosphor](https://phosphoricons.com), not a kebab-case path.
