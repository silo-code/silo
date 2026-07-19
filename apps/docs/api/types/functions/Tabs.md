# Function: Tabs()

```ts
function Tabs<T>(__namedParameters): Element;
```

Defined in: [packages/sdk/src/Tabs.tsx:42](https://github.com/silo-code/silo/blob/main/packages/sdk/src/Tabs.tsx#L42)

A borderless strip attached to the content panel it switches. The active
tab's background **is** the panel's background — that shared fill is what
makes the tab read as part of the panel. Pair with [TabPanel](TabPanel.md).
Native tab stops per tab; no arrow-key roving.

Styled purely via host-provided `.silo-tabs` / `.silo-tab` classes — no
stylesheet import is needed in the extension.

## Type Parameters

### T

`T` *extends* `string`

## Parameters

### \_\_namedParameters

#### tabs

[`TabItem`](../interfaces/TabItem.md)\<`T`\>[]

#### active

`T`

#### onSelect

(`id`) => `void`

## Returns

`Element`

## Example

```tsx
<Tabs
  tabs={[
    { id: "panels", label: "Side Panels" },
    { id: "statusBar", label: "Status Bar" },
    { id: "options", label: "Options" },
  ]}
  active={tab}
  onSelect={setTab}
/>
<TabPanel>{tab === "panels" && <PanelsSettings />}</TabPanel>
```
