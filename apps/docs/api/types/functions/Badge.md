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

Two sizes: the default `"md"` text chip (chrome−1, roomier pad), and
`"sm"` (chrome, pad `0 5px`) for counters beside a label. **Font size is
always an absolute chrome token** — never surrounding `em` / parent
cascade — so a badge looks the same in every pane.

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
