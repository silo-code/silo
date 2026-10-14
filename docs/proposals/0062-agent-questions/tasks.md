# Tasks — 0062. Agent questions (ACP elicitation)

**Phase 4 only: host plumbing + the public SDK surface.** Phase 3 shipped
(PR #625); phase 5 remains.

## Protocol layer (`acp-jsonrpc.ts`)

- [x] `AcpElicitationRequest` / `AcpElicitationOutcome`.
- [x] `onElicitation?` on `AcpClientCallbacks` — optional, so this layer owns
      the "nobody is listening → `cancel`" rule.
- [x] `elicitation/create` branch, parsing via phase 3's `parseElicitation`.
- [x] Reply with the response object **unwrapped** (`{ action, content? }`),
      not nested the way `session/request_permission` nests `outcome`.
- [x] One-shot responder.
- [x] `mode: "url"` → `cancel` + a log line.
- [x] No longer falls through to the `-32601` branch.

## Session service (`acp-sessions-service.ts`)

- [x] `elicitationListeners`, cleared on dispose.
- [x] `onElicitation` callback driving the **same** `raiseBlockedOnUser` /
      `clearBlockedOnUser` helpers phase 2 extracted — no second copy.
- [x] Disposed / no listener → `cancel` immediately.
- [x] Synchronous answer raises no attention and no sound.
- [x] Per-listener `try`/`catch`, so one bad extension cannot strand the agent.
- [x] `toSdkElicitation`, serializing answers through phase 3's
      `toElicitationContent`.
- [x] `onElicitation(listener)` on the handle, returning a `Disposable`.

## Public surface (`packages/sdk`)

- [x] `AgentElicitationRequest`, `AgentElicitationQuestion`,
      `AgentElicitationQuestionKind`, `AgentElicitationOption`,
      `AgentElicitationCustomAnswer`, `AgentElicitationAnswer`.
- [x] `onElicitation` on `AgentSessionHandle`.
- [x] TSDoc with `@public` / `@beta` / `@category`, including the
      Auto-Accept-is-permission-only note and the `decline` vs `cancel`
      distinction.
- [x] Barrel re-export (`packages/sdk/src/index.ts`).
- [x] `pnpm docs:api` — six new reference pages generated.
- [x] `AgentActivity`'s `"blocked"` TSDoc widened from permission-specific
      wording to "awaiting a user answer".

## Docs

- [x] `docs/domain-language.md` — new **Question** entry; **Activity**,
      **Witnessed** and **Chat Session** widened off
      `session/request_permission`.
- [x] `apps/docs/roadmap.md` — `planned` rows for `onElicitation` and for
      option `preview`.

## Tests

- [x] `acp-jsonrpc.test.ts` — parsed delivery, the unwrapped result shape,
      one-shot answering, url-mode cancel, missing-callback cancel, and the
      unreadable-schema acknowledge form.
- [x] `acp-sessions-service.test.ts` — attention raised and cleared, custom
      answer routing, decline/cancel idempotence, synchronous answer, active
      session, no listener, post-dispose, a throwing listener, and
      subscription disposal.
- [x] Vacuity check: 10 single-branch mutations across both layers, each
      producing a matching failure. No gaps this round.

## Verification

- [x] Every requirement in `requirements.md` is met.
- [x] `pnpm test` (11/11 tasks), `pnpm --filter silo exec tsc --noEmit`, and
      `pnpm lint` pass.
- [x] Still **inert**: `clientCapabilities` is untouched, so no agent sends an
      `elicitation/create`. The path is reachable but unreached.
- [x] **No ADR needed.** The shape follows `AgentPermissionRequest`'s
      precedent (parsed fields plus `raw`) and the `blocked`-widening decision
      already recorded in `proposal.md`'s Alternatives.
- [ ] **Do not collapse the package** — phase 5 remains.

## Notes from implementation

- **The response is not shaped like the permission response.** Permission
  answers `{ outcome: { outcome, optionId } }`; `elicitation/create` answers
  `{ action, content? }` at the top level. Confirmed against the ACP SDK's
  `zCreateElicitationResponse` rather than inferred from the neighbouring code
  — copying the nesting would read to the agent's validating guard as a
  malformed accept, i.e. **empty content**, silently discarding every answer.
  This is the single most dangerous mistake available in this phase, and the
  mutation test for it is the one that matters most.
- **Idempotence now sits in two places on purpose.** The protocol layer already
  deduped the JSON-RPC reply, but `respond`/`decline`/`cancel` are documented
  as idempotent on the _public_ surface, so `toSdkElicitation` guards too.
  Without it a second call re-ran the turn-adoption bookkeeping. A test caught
  this — the first draft only had the lower guard.
- **`respond`'s shape diverges from `proposal.md`'s sketch** (`Record<string,
string | readonly string[]>`), which cannot express a boolean, a number, or a
  custom-answer override. `proposal.md` is corrected in the same change.
- **Phase 3's `ElicitationAnswer.value` widened to `readonly string[]`** so the
  public type flows into the host serializer without a cast.
