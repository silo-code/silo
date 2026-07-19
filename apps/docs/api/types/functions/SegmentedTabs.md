# Function: SegmentedTabs()

```ts
function SegmentedTabs<T>(__namedParameters): Element;
```

Defined in: [packages/sdk/src/SegmentedTabs.tsx:39](https://github.com/silo-code/silo/blob/main/packages/sdk/src/SegmentedTabs.tsx#L39)

A pill riding in a recessed well — self-contained, no relationship to
content below it, so it can sit in a header row next to other controls.
Native tab stops per segment; no arrow-key roving.

Styled purely via host-provided `.silo-segmented*` classes — no stylesheet
import is needed in the extension.

## Type Parameters

### T

`T` *extends* `string`

## Parameters

### \_\_namedParameters

#### tabs

[`SegmentedTabItem`](../interfaces/SegmentedTabItem.md)\<`T`\>[]

#### active

`T`

#### onSelect

(`id`) => `void`

## Returns

`Element`

## Example

```tsx
<SegmentedTabs
  tabs={[
    { id: "browse", label: "Browse" },
    { id: "installed", label: "Installed" },
  ]}
  active={tab}
  onSelect={setTab}
/>
```
