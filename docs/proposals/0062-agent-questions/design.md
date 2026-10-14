# Design — 0062. Agent questions (ACP elicitation)

**Phase 5: the form card, then the flip.** See `requirements.md` for the
behavioral spec. Unlike phases 3 and 4 this one is **not inert** — the
capability flip at the end is the switch that makes every earlier phase live.

## Architecture

Three layers, each already holding the permission equivalent — this phase adds
the elicitation sibling beside it rather than inventing a path:

```
packages/sdk/src/agents-service.ts          ← AgentElicitationRequest, onElicitation
  ↑ (host → SDK, the normal leaf direction)
packages/extension-host/src/extension-host/agents/
├── acp-jsonrpc.ts            ← elicitation/create in handleServerRequest
├── acp-sessions-service.ts   ← blocked bookkeeping + toSdkElicitation
└── elicitation-schema.ts     ← phase 3, now actually called
```

Nothing new is created structurally. `elicitation-schema.ts` stops being inert.

## Components

| Change                                      | Where                     |
| ------------------------------------------- | ------------------------- |
| `AcpElicitationRequest` / `...Outcome`      | `acp-jsonrpc.ts`          |
| `onElicitation` on `AcpClientCallbacks`     | `acp-jsonrpc.ts`          |
| `elicitation/create` branch                 | `handleServerRequest`     |
| `elicitationListeners` + the callback       | `acp-sessions-service.ts` |
| `toSdkElicitation`                          | `acp-sessions-service.ts` |
| `AgentElicitation*` types + `onElicitation` | `packages/sdk`            |

`onElicitation` on `AcpClientCallbacks` is **optional**. Every real caller
implements it; the optionality exists so the protocol layer owns the
"nobody is listening → `cancel`" rule in one place, and so existing test
fixtures that build a callback set stay valid.

## Data flow

```
agent → elicitation/create { mode, sessionId, toolCallId?, message, requestedSchema }
  └─ handleServerRequest
       ├─ mode === "url" → cancel + log (we advertise `form` only)
       ├─ no cb.onElicitation → cancel
       └─ parseElicitation(params) → AcpElicitationRequest
            └─ acp-sessions-service.onElicitation
                 ├─ disposed | no listener → cancel
                 ├─ toSdkElicitation → every listener
                 └─ still unanswered → raiseBlockedOnUser()

extension answers
  └─ respond(answers) → toElicitationContent → { action: "accept", content }
     decline()        → { action: "decline" }
     cancel()         → { action: "cancel" }
       └─ one-shot respondResult(id, outcome)   ← the response object itself
            └─ clearBlockedOnUser()
```

**The JSON-RPC result is the response object, unwrapped.** This is the one place
the elicitation path is _not_ shaped like the permission path:
`session/request_permission` answers `{ outcome: { outcome, optionId } }`, while
`elicitation/create` answers `{ action, content? }` at the top level. Verified
against `zCreateElicitationResponse` in `@agentclientprotocol/sdk`, not inferred
from the permission precedent — copying that nesting would produce a payload the
agent's validating guard reads as a malformed accept, i.e. **empty content**,
silently discarding every answer.

## APIs / interfaces

The public surface mirrors `AgentPermissionRequest` — parsed fields plus `raw`:

```ts
interface AgentElicitationRequest {
  readonly message: string;
  readonly questions: readonly AgentElicitationQuestion[];
  readonly acknowledgeOnly: boolean;
  readonly toolCallId?: string;
  readonly raw: Readonly<Record<string, unknown>>;
  respond(answers: Readonly<Record<string, AgentElicitationAnswer>>): void;
  decline(): void;
  cancel(): void;
}
```

`AgentElicitationQuestion` is the phase-3 `ElicitationQuestion` re-declared as a
`readonly` public type — the rename the phase-3 design planned for, not a
redesign.

**`respond`'s shape diverges from the proposal's sketch** (`Record<string,
string | readonly string[]>`), which cannot express a boolean, a number, or a
custom-answer override. See `requirements.md`'s divergence note; `proposal.md`
is corrected in the same change rather than left contradicting the code.

This phase owes the full `silo-docs-sync` workflow: TSDoc with
`@public`/`@beta`/`@category`, the barrel re-export, the hand-authored `ctx`
member page where relevant, `pnpm docs:api`, and a `planned` roadmap entry.

## Persistence

None, unchanged from phase 3. An elicitation is live-only — answered within the
turn or not at all. Nothing is journaled, so a question open across a reload is
simply gone, which is also what the agent's own timeout assumes.

## Error handling

- Every inbound path answers exactly once; the responder guards re-entry with
  the same `answered` flag the permission responder uses.
- A listener that throws is caught per-listener (the `agentsChannel.debug` line
  the permission path already uses) so one bad extension cannot strand the
  agent or starve the other listeners.
- `parseElicitation` is total, so the protocol layer has no parse-failure branch
  to write — phase 3's design decision paying out here.
- The `silo:agents` channel owns the diagnostic line for a url-mode request,
  per phase 3's note that the _caller_ logs.

## Testing strategy

Pure-logic Vitest, co-located, per `silo-testing`:

- `acp-jsonrpc.test.ts` — the request/response round trip over a fake
  transport: the unwrapped result shape, one-shot answering, url-mode cancel,
  the missing-callback cancel, and that the method no longer answers `-32601`.
- `acp-sessions-service.test.ts` — the blocked bookkeeping via the `store`
  proxy: unconditional `blocked`, active-session attention suppression, the
  synchronous-answer case raising nothing, turn adoption on answer, and
  post-dispose arrival.
- The answer→`content` path asserted through the SDK handle, so the
  `toElicitationContent` wiring is covered where an extension actually sits.

## Constraints and existing decisions

- **No new `AgentActivity` value** — `blocked` widens, per the proposal's
  Alternatives. Its SDK TSDoc and `docs/domain-language.md`'s **Activity**
  entry widen from permission-specific wording in this change.
- **RFC 0047 (Auto Accept) stays permission-only.** Stated in the TSDoc so a
  later reader does not "fix" the asymmetry: there is no safe answer to invent
  for a question.
- **Host → SDK is the normal leaf direction**; nothing lints against the host
  importing SDK types, and no extension gains access to host internals here.
- **ADR 0028**, sealed detection — untouched, no agent-identity path added.
