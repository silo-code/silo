# Function: AgentIconGlyph()

```ts
function AgentIconGlyph(__namedParameters): Element | null;
```

Defined in: [packages/sdk/src/AgentIconGlyph.tsx:23](https://github.com/silo-code/silo/blob/main/packages/sdk/src/AgentIconGlyph.tsx#L23)

Renders a Catalog Agent's brand mark from its [AgentIcon](../interfaces/AgentIcon.md) data (get one
from [AgentsService.catalog](../interfaces/AgentsService.md#catalog)). Data-driven on purpose — it takes the
icon, not an agent id, so it has no dependency on the sealed catalog and one
renderer serves the host `+` menu, `silo.agents`, and third-party extensions.

Returns `null` when `mode` is `"none"` or `icon` is absent — callers that
gate tab chrome on "is there an icon" should check the return value, not
construct the element unconditionally.

`"color"` tints the glyph with the brand's own hex (picking
[AgentIcon.hexLight](../interfaces/AgentIcon.md#hexlight) / [AgentIcon.hexDark](../interfaces/AgentIcon.md#hexdark) by `colorScheme`, since
one hex can't contrast against both a light and a dark tab strip);
`"monotone"` leaves `color` unset so it inherits `currentColor` from an
ancestor. A duotone source (OpenCode's frame + panel) layers a second
40%-opacity path rather than flattening to one fill.

## Parameters

### \_\_namedParameters

#### icon

[`AgentIcon`](../interfaces/AgentIcon.md) \| `undefined`

#### mode

[`AgentIconMode`](../type-aliases/AgentIconMode.md)

#### colorScheme

`"dark"` \| `"light"`

The host's active light/dark base — selects `hexLight` / `hexDark` in
 `"color"` mode.

#### className?

`string`

## Returns

`Element` \| `null`
