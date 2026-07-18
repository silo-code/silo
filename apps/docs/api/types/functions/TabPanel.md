# Function: TabPanel()

```ts
function TabPanel(__namedParameters): Element;
```

Defined in: [packages/sdk/src/Tabs.tsx:87](https://github.com/silo-code/silo/blob/main/packages/sdk/src/Tabs.tsx#L87)

The content panel a [Tabs](Tabs.md) strip attaches to. Active-tab and panel
share the same background token — that's the "attached" illusion.

## Parameters

### \_\_namedParameters

#### children?

`ReactNode`

## Returns

`Element`

## Example

```tsx
<TabPanel>{tab === "panels" && <PanelsSettings />}</TabPanel>
```
