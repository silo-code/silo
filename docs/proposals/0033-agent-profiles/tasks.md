# Tasks — 0033. Agent Profiles, phase 2 (Addressing a profile by name)

The implementation plan for **phase 2 only**. Ordered: the state and the pure
model first, then the commands that consume them, then the CLI, then the
dangling-id repair, then docs. Keep the checkboxes current as work proceeds.
Working artifact — removed when the proposal collapses.

## Data model and state (R2, R3)

- [ ] Add `default?: boolean` to `AgentProfile` (`state/types.ts`) with a TSDoc
      comment naming its two consumers and the at-most-one invariant.
- [ ] Add `setDefaultAgentProfile(id)` and `clearDefaultAgentProfile()` to
      `state/agent-profiles.ts`, clearing the flag from every other profile in
      the same mutation. Do **not** touch `removeAgentProfile` — deleting the
      default promotes nobody.
- [ ] Add `resolveDefaultProfile(profiles)` to
      `agents/agent-profile-model.ts` (explicit default → first → undefined).
- [ ] Add `profileCommandId(profileId)` to the same module, as the one place
      `` `core.newAgent.${id}` `` is spelled.
- [ ] Harden `loadAgentProfiles` (`state/persistence-model.ts`): copy `default`
      only when strictly `true`; keep it on the first claiming entry and strip
      it from the rest.
- [ ] Re-export the new state and model functions from
      `@silo-code/extension-host/internal`.

## Profiles tab — the default gesture (R2)

- [ ] Add **Set as default** / **Clear default** to `ProfileRow`'s `⋮` menu,
      wired to the new state functions.
- [ ] Mark the default row visually (SDK kit inside the existing `ListRow`; no
      bespoke chrome, no hard-coded colors — design tokens only).

## Commands (R1, R3)

- [ ] Add `packages/extensions-core/src/agents-settings/profile-commands.ts`:
      a `Map<profileId, Disposable>` reconciled on every
      `subscribeAgentProfiles` tick — register new ids, dispose removed ones,
      re-register on a label change.
- [ ] Give each profile command the label `New Agent: <profile label>` and a
      `run` that does: active workspace → `pickWorkspaceFolder` →
      `launchAgentProfile({ profileId, workspaceId, cwd })`. No explicit panel
      creation.
- [ ] Register the generic `core.newAgent` once at activation, resolving its
      target through `resolveDefaultProfile`; with zero profiles it opens
      Settings → Agents instead of launching.
- [ ] Wire both from `core.agents-settings`' `activate`, and confirm the
      subscription and every registration are disposed on teardown.

## CLI — Rust (R4)

- [ ] In `commands/cli.rs`, add flag parsing for `agent run` that understands
      `--profile <value>` and `--profile=<value>`, ignores unknown flags, and
      treats a valueless trailing `--profile` as absent.
- [ ] Add the `agent` arm **before** the path fall-through, matching only when
      the next positional is `run`, and emitting
      `action: "agent-run"` with `id` = profile id (or `None`) and `path` =
      normalized cwd. Leave `install` / `uninstall` / path arms untouched.
- [ ] Extend the module doc comment's subcommand list with `silo agent run`.

## CLI — TypeScript (R5)

- [ ] Add `findWorkspaceContaining(workspaces, cwd)` beside
      `findWorkspaceByFolder` in `apps/desktop/src/cli/open-handler.ts` —
      longest match, `extraFolders` included, segment-boundary aware.
- [ ] Add `apps/desktop/src/cli/agent-run-handler.ts`: resolve the profile
      (`--profile` id, else `resolveDefaultProfile`) → on a miss, log to the
      Output panel and stop; resolve the workspace (`findWorkspaceContaining`,
      else `createWorkspace` at the cwd) → **launch, then activate, then
      focus**, passing the forwarded cwd as the terminal's cwd.
- [ ] Extend `apps/desktop/src/cli/index.ts`'s `CliRequest` union and `dispatch`
      with the `agent-run` arm.

## Dangling command ids (R6, R7)

- [ ] In `extension-host/keybindings.ts`, make `dispatchOverrideOnly` skip an
      override whose command is not in `commandRegistry` — before it calls
      `preventDefault` / `stopPropagation`. Comment why the entry is kept rather
      than pruned (ADR 0046).
- [ ] In `ProfileEditorModal`'s save path, when editing an existing profile and
      the id changed, check `overrideKey` / `isRemoved` on
      `profileCommandId(currentId)` and, if bound, `ctx.ui.confirm` naming the
      chord via `displayKey`. Cancel abandons the save; confirm proceeds.

## Tests

- [ ] `agent-profile-model.test.ts` — `resolveDefaultProfile` (explicit default
      not first in order; no default → first; empty → undefined);
      `profileCommandId`.
- [ ] `agent-profiles.test.ts` — setting a default clears the previous one;
      clearing; deleting the default promotes nobody; an id rename preserves the
      flag.
- [ ] `persistence-model.test.ts` — `default` round-trip; two-defaults input
      keeps the first; a non-boolean `default` is dropped without dropping the
      profile.
- [ ] `profile-commands.test.ts` — reconcile add / delete / rename /
      label-change; the generic command's three resolution outcomes.
- [ ] `keybindings.test.ts` — a dangling override neither dispatches nor
      `preventDefault`s; a registered override still does.
- [ ] `agent-run-handler.test.ts` — `findWorkspaceContaining`: exact, nested,
      `extraFolders`, longest-wins (`~/a` vs `~/a/b`), and the `/a/b` vs `/a/bc`
      boundary; plus the profile-miss path creating nothing.
- [ ] Rust `mod tests` in `cli.rs` — `agent run --profile x`, `--profile=x`,
      bare `agent run`, valueless `--profile`, extra positional, unknown flag,
      and `silo agent` (no `run`) still resolving to an open-path request.

## Documentation

- [ ] `apps/docs/guide/cli.md` — a `silo agent run [--profile <id>]` section
      covering cwd-based workspace resolution and the default fallback.
- [ ] `apps/docs/roadmap.md` — name `silo agent run` in the CLI entry. Leave the
      `Agent Profiles (ctx.agents.profiles)` badge `planned` (phase 5).
- [ ] `docs/domain-language.md` — record **default profile** in the Agent
      Profile entry, and that the id is also a `core.newAgent.<id>` component.
- [ ] Confirm `pnpm docs:api` output is unchanged (no SDK surface touched).

## Verification

- [ ] Every requirement in `requirements.md` is met or explicitly noted as not.
- [ ] `pnpm test`, `pnpm --filter silo exec tsc --noEmit`, and `pnpm lint` pass.
- [ ] `cargo test` passes in `apps/desktop/src-tauri`.
- [ ] The doc-index test passes.
- [ ] Durable decisions recorded as ADRs. (None expected: phase 2 applies
      ADR 0046 rather than deciding anything new. If the dangling-binding rule
      turns out to generalize beyond profiles, reconsider.)
- [ ] Proposal collapsed to a single curated `0033-agent-profiles.md` with
      `status: accepted` (phases 3–9 remain) and phase 2 marked shipped in the
      phase table.
