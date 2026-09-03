# Function: ActivityGlyph()

```ts
function ActivityGlyph(__namedParameters): Element;
```

Defined in: [packages/sdk/src/ActivityGlyph.tsx:31](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ActivityGlyph.tsx#L31)

Host-painted activity glyph — same look on workspace rows, CenterDock tabs,
and extension UI. Pick an [Activity](../type-aliases/Activity.md); the host owns color and motion
(ADR 0030). Omit `activity` only for the workspace-row neutral gray fallback.

Styled purely via host-provided `.silo-activity*` classes — no stylesheet
import is needed in the extension.

Pass `jitterKey` whenever several animated glyphs render together (a list of
agent or workspace rows) so their pulses don't run in lockstep — and so each
one starts mid-cycle instead of freezing on first paint.

## Parameters

### \_\_namedParameters

`object` & `Omit`\<`HTMLAttributes`\<`HTMLSpanElement`\>, `"children"`\>

## Returns

`Element`

## Example

```tsx
<ActivityGlyph activity="working" size="md" />
<ActivityGlyph activity="ready" jitterKey={row.id} />
<ActivityGlyph size="sm" /> // workspace neutral (omit)
```
