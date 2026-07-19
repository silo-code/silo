# Function: Badge()

```ts
function Badge(__namedParameters): Element;
```

Defined in: [packages/sdk/src/Badge.tsx:28](https://github.com/silo-code/silo/blob/main/packages/sdk/src/Badge.tsx#L28)

A small pill for status or identity — on a [ListRow](ListRow.md)'s trailing
slot, in a [SettingRow](SettingRow.md)'s control slot, next to a title. An
arbitrary `color` overrides `tone` for identity colors (e.g. workspace
group swatches) via the `--badge-color` custom property.

Styled purely via host-provided `.silo-badge*` classes — no stylesheet
import is needed in the extension.

## Parameters

### \_\_namedParameters

`object` & `Omit`\<`HTMLAttributes`\<`HTMLSpanElement`\>, `"children"` \| `"color"`\>

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
```
