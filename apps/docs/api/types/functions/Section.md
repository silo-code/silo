# Function: Section()

```ts
function Section(__namedParameters): Element;
```

Defined in: [packages/sdk/src/Section.tsx:29](https://github.com/silo-code/silo/blob/main/packages/sdk/src/Section.tsx#L29)

A labeled group — the uppercase `NAME` / `FOLDERS` / `FORMATTING` headers
seen throughout Silo's modals and settings pages.

Styled purely via host-provided `.silo-section*` classes — no stylesheet
import is needed in the extension.

## Parameters

### \_\_namedParameters

#### label

`string`

Rendered uppercase, letter-spaced, chrome−1, `text-lo`.

#### accessory?

`ReactNode`

Right-aligned — a count badge, an add affordance.

#### children?

`ReactNode`

## Returns

`Element`

## Example

```tsx
<Section label="Formatting">
  <SettingRow
    label="Format on save"
    hint="Run Format Document before writing to disk."
  >
    <Switch
      checked={formatOnSave}
      onChange={setFormatOnSave}
      aria-label="Format on save"
    />
  </SettingRow>
</Section>
```
