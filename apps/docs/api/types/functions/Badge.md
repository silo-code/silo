# Function: Badge()

```ts
function Badge(__namedParameters): Element;
```

Defined in: [packages/sdk/src/Badge.tsx:34](https://github.com/silo-code/silo/blob/main/packages/sdk/src/Badge.tsx#L34)

A small pill for status or identity — on a [ListRow](ListRow.md)'s trailing
slot, in a [SettingRow](SettingRow.md)'s control slot, next to a title. An
arbitrary `color` overrides `tone` for identity colors (e.g. workspace
group swatches) via the `--badge-color` custom property.

Styled purely via host-provided `.silo-badge*` classes — no stylesheet
import is needed in the extension.

Two sizes: the default `"md"` text chip, and `"sm"` — tighter padding at a
slightly smaller, em-relative size, for counters sitting beside a label
(a section's row count, a workspace's extra-folder count). `"sm"` scales
with the surrounding text, so it tracks a side column's own font size.

## Parameters

### \_\_namedParameters

`object` & `Omit`\<`HTMLAttributes`\<`HTMLSpanElement`\>, `"color"` \| `"children"`\>

## Returns

`Element`

## Example

```tsx
<Badge tone="ok">Installed</Badge>
<Badge tone="warn">Update available</Badge>
<Badge tone="accent">current</Badge>
<Badge>primary</Badge>
<Badge tone="outline">Silo</Badge>
<Badge color="#e06c75">Frontend</Badge>
<Badge size="sm">{rows.length}</Badge>
```
