# Design — 0062. Agent questions (ACP elicitation)

**Phase 3 only: the schema parser.** See `requirements.md` for the behavioral
spec and `proposal.md` for why this phase lands inert.

## Architecture

One new leaf module in the host's agents directory, with its co-located test:

```
packages/extension-host/src/extension-host/agents/
├── elicitation-schema.ts        ← new, pure, no imports from state/services
└── elicitation-schema.test.ts   ← new
```

It imports nothing from the host runtime — no store, no services, no channel.
That is what makes it exhaustively testable and what keeps phase 3 inert: the
module is reachable from nothing until phase 4 calls it.

## Components

| Export                      | Responsibility                                                        |
| --------------------------- | --------------------------------------------------------------------- |
| `parseElicitation(params)`  | `elicitation/create` params → `ParsedElicitation`                     |
| `toElicitationContent(...)` | questions + collected answers → the protocol's `content` object       |
| `ParsedElicitation`         | `{ message, questions, acknowledgeOnly, raw }`                        |
| `ElicitationQuestion`       | one question: `id`, `kind`, `prompt`, `title?`, `options?`, `custom?` |
| `ElicitationOption`         | `{ value, label, description? }`                                      |

`acknowledgeOnly` is the R3 backstop made explicit rather than left implicit in
an empty `questions` array: the renderer needs to know it is showing a message
with accept/decline/cancel _on purpose_, not failing to find fields.

## Data flow

```
elicitation/create params
  └─ parseElicitation
       ├─ requestedSchema not an object, or no usable properties
       │    └─ { questions: [], acknowledgeOnly: true }
       └─ for each property, in schema order
            ├─ carries _askUserQuestionCustomAnswer → attach to its target
            └─ otherwise → classify by declared type → ElicitationQuestion

                 … renderer collects answers (phase 5) …

answers + questions
  └─ toElicitationContent  →  { [fieldKey]: string | string[] | boolean | number }
```

Two passes over `properties`, not one: the custom-answer companion can appear
before the question it belongs to, so questions are built first and companions
attached second. A single pass would drop a companion that leads its target.

## APIs / interfaces

**No public SDK surface in this phase** — these types are host-internal, so the
`docs-sync` workflow does not apply yet. Phase 4 maps `ElicitationQuestion`
onto the `@silo-code/sdk` `AgentElicitationQuestion` it exposes, and that is
where TSDoc, `@public`, the barrel re-export and `pnpm docs:api` land.

The model is nonetheless designed as the shape phase 4 will expose, so the
mapping is a rename rather than a redesign. `kind` is a closed union
(`"select" | "multi-select" | "text" | "boolean" | "number"`) because it drives
an exhaustive `switch` in both the serializer and the renderer.

## Persistence

None. An elicitation is live-only: it is answered within the turn or it is not
answered at all. Nothing about it is journaled in this phase.

## Error handling

The parser is **total** — it throws on no input. Every defensive branch
degrades toward a question the user can still answer (R3), never toward a
dropped question or an exception. This mirrors `parseConfigOptions` in
`acp-jsonrpc.ts`, which treats every field of a protocol payload as possibly
missing or mistyped; the same assumption applies here and for the same reason.

The one place the serializer deliberately drops data is an unparseable `number`
(R4): the agent's `acceptedElicitationContent` runs a validating guard that
yields **empty content** on a malformed accept, so sending `NaN` would discard
the user's other answers too. Omitting the one bad key is strictly better than
risking all of them.

## Testing strategy

Pure-logic Vitest, co-located, no `@testing-library/react` — the
`silo-testing` conventions. Contract and edges:

- one test per recognized shape (R1) and per fallback rung (R3);
- the companion-attachment cases including a companion that _precedes_ its
  target and one naming an unknown id (R2);
- the serializer's coercions and its omission rules (R4);
- **one fixture built from Claude's real adapter output** — a two-question
  `askUserQuestionsToCreateRequest` payload copied from
  `claude-agent-acp`'s `elicitation.js`, round-tripped through both functions
  and asserted against the `answers` shape `applyAskElicitationResponse`
  reads. This is the test that catches a wrong assumption about the wire
  shape, which is phase 3's main risk; the hand-written unit tests cannot.

## Constraints and existing decisions

- **ADR 0028 (sealed detection)** — untouched: this adds no agent-identity path.
- **Host leaf layering** (`eslint.config.js`) — `state` / `services` do not
  import outward, and this module imports neither, so it sits cleanly as a leaf.
- **RFC 0038** — the elicitation model must stay consistent with
  `AcpPermissionRequest`'s precedent: parsed fields for consumers, plus `raw`
  for anything the model does not name (option `preview`, vendor `_meta`).
- **No `console.*`** — this module logs nothing at all; phase 4's caller owns
  the `silo:agents` channel line for an unparseable schema.
