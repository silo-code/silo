# Function: ActivityGlyph()

```ts
function ActivityGlyph(__namedParameters): Element;
```

Defined in: [packages/sdk/src/ActivityGlyph.tsx:26](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ActivityGlyph.tsx#L26)

Host-painted activity glyph — same look on workspace rows, CenterDock tabs,
and extension UI. Pick an [Activity](../type-aliases/Activity.md); the host owns color and motion
(ADR 0030). Omit `activity` only for the workspace-row neutral gray fallback.

Styled purely via host-provided `.silo-activity*` classes — no stylesheet
import is needed in the extension.

## Parameters

### \_\_namedParameters

`object` & `Omit`\<`HTMLAttributes`\<`HTMLSpanElement`\>, `"children"`\>

## Returns

`Element`

## Example

```tsx
<ActivityGlyph activity="working" size="md" />
<ActivityGlyph activity="ready" />
<ActivityGlyph size="sm" /> // workspace neutral (omit)
```
