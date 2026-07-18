# Function: Callout()

```ts
function Callout(__namedParameters): Element;
```

Defined in: [packages/sdk/src/Callout.tsx:24](https://github.com/silo-code/silo/blob/main/packages/sdk/src/Callout.tsx#L24)

A quiet set-off box for explanatory copy — a hairline border around body
text, no fill, no tone. Not a warning/error/info alert (there is
deliberately no `tone`): status belongs to [Badge](Badge.md) tones and
[EmptyState](EmptyState.md).

Styled purely via the host-provided `.silo-callout` class — no stylesheet
import is needed in the extension.

## Parameters

### \_\_namedParameters

#### children?

`ReactNode`

## Returns

`Element`

## Example

```tsx
<Callout>
  Opening a worktree adds it as another folder in this workspace — its
  files, terminals, and Git panel appear alongside your current ones.
  Closing a view leaves the worktree untouched on disk.
</Callout>
```
