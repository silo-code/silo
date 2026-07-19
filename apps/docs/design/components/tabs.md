# Tabs

Two visually distinct tab components for two different jobs. They are **not**
sizing variants of each other — pick by role:

| Job                                                                    | Use             |
| ---------------------------------------------------------------------- | --------------- |
| Switch a whole page/panel of content below the strip                   | `Tabs`          |
| A compact inline mode toggle (Browse ⁄ Installed) that floats anywhere | `SegmentedTabs` |

<div class="silo-demo silo-demo-block">
  <div style="max-width:380px; margin-bottom:16px;">
    <div class="silo-tabs">
      <button class="silo-tab" data-active="true">Side Panels</button>
      <button class="silo-tab">Status Bar</button>
      <button class="silo-tab">Options</button>
    </div>
    <div class="silo-tab-panel">Memory · Donut chart of used, cache, and free memory.</div>
  </div>
  <div class="silo-segmented">
    <button class="silo-segmented-tab" data-active="true">Browse</button>
    <button class="silo-segmented-tab">Installed</button>
  </div>
</div>

## Tabs / TabPanel

A borderless strip attached to the content panel it switches. The active tab's
background **is** the panel's background — that shared fill is what makes the
tab read as part of the panel. Auto-width, left-aligned.

```tsx
import { Tabs, TabPanel } from "@silo-code/sdk";

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

| Prop                  | Type                     | Notes      |
| --------------------- | ------------------------ | ---------- |
| `tabs`                | `{ id; label; icon? }[]` |            |
| `active` / `onSelect` | `T` / `(id: T) => void`  | controlled |

| Color                         | Token                                                 |
| ----------------------------- | ----------------------------------------------------- |
| Strip background              | `--silo-color-input-bg`                               |
| Active tab + panel background | `--silo-color-bg` (the same token — that's the trick) |
| Inactive / active text        | `--silo-color-text` / `--silo-color-text-hi` (600)    |
| Inactive hover                | derived (`color-mix` of text into the strip)          |

## SegmentedTabs

A pill riding in a recessed well — self-contained, no relationship to content
below it, so it can sit in a header row next to other controls.

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

| Color                 | Token                                            |
| --------------------- | ------------------------------------------------ |
| Well                  | `--silo-color-content-bg`                        |
| Active pill / text    | `--silo-button-bg` / `--silo-color-text-hi`      |
| Inactive text / hover | `--silo-color-text-lo` / `--silo-color-bg-hover` |

**Keyboard:** each tab is its own tab stop; Space/Enter activates. No
arrow-key roving.
