# Decision records (ADRs)

Decisions **already made**, recorded so the _why_ outlives the conversation.
Part of the project's governance layer.

## ADR vs. RFC — when to write which

- **ADR (here, `docs/decisions/`)** — a decision that's **settled**. Retrospective,
  short. "We decided X, here's why, here's what it costs." Write one whenever a
  non-obvious choice is made that someone would otherwise re-litigate.
- **RFC (`docs/proposals/`, when it exists)** — a **forward-looking change** that's
  cross-cutting, hard to reverse, or contentious and needs design before deciding
  (a new `ctx` domain, a breaking change, the sandbox model, the manifest format).
  Rule of thumb: _if getting it wrong means a breaking SDK change later, write the
  RFC._ An RFC can crystallize into an ADR when it lands.

A small, obvious choice needs neither.

## Conventions

- **Numbering** is sequential (`NNNN-kebab-title.md`) and permanent; never reused.
  (This initial batch was seeded retroactively in **decision-date order**, so the
  numbers track when each decision was made.)
- **Self-contained, minimal external links.** An ADR is the **durable** record, so
  it links **only to other ADRs** (stable). The narrative/planning docs (strategy,
  architecture audits, plans) **will be overhauled** — ADRs mention them only as
  brief plain-text provenance, never as navigation links that would rot. The
  decision's full meaning lives in the ADR.
- **Never delete or rewrite history.** A reversed decision isn't deleted — a new
  ADR supersedes it and the old one's `status` flips to `superseded-by NNNN`.
- **Status:** `proposed` · `accepted` · `rejected` · `superseded-by NNNN`.
- **Format:** MADR-lite — see `template.md`.
- **The index is enforced, not curated by memory.** A new ADR or a status change
  means updating the row below — a unit test
  ([`apps/docs/checks/doc-indexes.sync.test.ts`](../../apps/docs/checks/doc-indexes.sync.test.ts))
  fails when the table and this directory disagree on which ADRs exist, where a
  row links, or a row's `date` / `status`. Titles are yours.

## Index

| ADR                                                           | Title                                                              | Date       | Status   |
| ------------------------------------------------------------- | ------------------------------------------------------------------ | ---------- | -------- |
| [0001](./0001-in-process-extension-architecture.md)           | In-process, registry-based extension architecture                  | 2026-05-23 | accepted |
| [0002](./0002-imperative-registration-no-manifest.md)         | Imperative registration; no static manifest (v1)                   | 2026-05-23 | accepted |
| [0003](./0003-monorepo-pnpm.md)                               | Monorepo with pnpm workspaces                                      | 2026-05-29 | accepted |
| [0004](./0004-sdk-types-first.md)                             | Public `@silo-code/sdk` is types-first                             | 2026-05-29 | accepted |
| [0005](./0005-ui-library-internal.md)                         | Component library (`@silo-code/ui`) stays internal                 | 2026-05-29 | accepted |
| [0006](./0006-open-platform-licensing.md)                     | Open-platform MIT licensing                                        | 2026-05-30 | accepted |
| [0007](./0007-core-primitive-vs-extension-test.md)            | Core-primitive vs extension-feature test                           | 2026-05-31 | accepted |
| [0008](./0008-extension-decomposition-provider-view.md)       | Extension decomposition; provider/view split                       | 2026-05-31 | accepted |
| [0009](./0009-extension-communication-and-events.md)          | Extension communication: typed APIs + domain events                | 2026-05-31 | accepted |
| [0010](./0010-persistent-process-sessions.md)                 | Persistent process sessions as a core primitive                    | 2026-05-31 | accepted |
| [0011](./0011-editor-and-terminal-are-core.md)                | Editor and terminal are core surfaces                              | 2026-05-31 | accepted |
| [0012](./0012-dev-automation-rpc.md)                          | Dev-only automation RPC                                            | 2026-06-01 | accepted |
| [0013](./0013-trust-tiers-two-barrel-sdk.md)                  | Extension trust tiers + two-barrel SDK                             | 2026-06-02 | accepted |
| [0014](./0014-per-extension-enablement.md)                    | Per-extension enablement config (Obsidian-style)                   | 2026-06-02 | accepted |
| [0015](./0015-phased-security-model.md)                       | Phased security model for privileged primitives                    | 2026-06-02 | accepted |
| [0016](./0016-ctx-dnd-primitive.md)                           | First-class drag-and-drop primitive (`ctx.dnd`)                    | 2026-06-02 | accepted |
| [0017](./0017-css-theming-contract.md)                        | CSS theming contract (`--silo-*` token tiers)                      | 2026-06-02 | accepted |
| [0018](./0018-host-owned-chrome.md)                           | Host-owned UI chrome: modals + unified menu                        | 2026-06-03 | accepted |
| [0019](./0019-runtime-extension-loading.md)                   | Runtime extension loading + manifest validation                    | 2026-06-04 | accepted |
| [0020](./0020-silo-extensions-bundled.md)                     | Ship `silo.*` bundled, surfaced as disable-able                    | 2026-06-04 | accepted |
| [0021](./0021-keyboard-navigation-architecture.md)            | Keyboard nav: headless focus-group + region model                  | 2026-06-08 | accepted |
| [0022](./0022-on-disk-storage-layout.md)                      | On-disk storage layout: config / app-state / runtime               | 2026-06-10 | accepted |
| [0023](./0023-workspace-groups-host-internal.md)              | Workspace panel groups are host-internal                           | 2026-06-30 | accepted |
| [0024](./0024-release-channels.md)                            | Two release channels: stable and nightly                           | 2026-07-01 | accepted |
| [0025](./0025-pending-remove-worktree.md)                     | Pending remove worktree: close folder on start                     | 2026-07-17 | accepted |
| [0026](./0026-sdk-component-set.md)                           | A curated presentational component set joins the SDK               | 2026-07-18 | accepted |
| [0027](./0027-terminal-link-policy.md)                        | Unified terminal link policy: modifier-click to open               | 2026-07-21 | accepted |
| [0028](./0028-sealed-agent-detection.md)                      | Sealed agent detection and honest resume                           | 2026-07-29 | accepted |
| [0029](./0029-adornments-vs-registration.md)                  | Adornments vs registration                                         | 2026-07-31 | accepted |
| [0030](./0030-activity-chrome.md)                             | Activity as first-class chrome                                     | 2026-07-31 | accepted |
| [0031](./0031-update-check-analytics.md)                      | Update-check analytics via a Cloudflare Worker proxy               | 2026-08-01 | accepted |
| [0032](./0032-dock-active-panel-authority.md)                 | One authority decides a dock's active panel                        | 2026-08-04 | accepted |
| [0033](./0033-laptop-mode-independent-layout.md)              | Laptop Mode is a second independent layout                         | 2026-08-06 | accepted |
| [0034](./0034-focus-and-activation-authority.md)              | Focus/activation: the live dock, and only the active panel         | 2026-08-07 | proposed |
| [0035](./0035-global-side-panel-layout.md)                    | Global Side Panel Layout is an opt-in shared arrangement           | 2026-08-08 | accepted |
| [0036](./0036-unified-update-ui-and-changelog.md)             | Unified update UI, in-app changelog, and skip-version              | 2026-08-10 | accepted |
| [0037](./0037-git-repo-watch-session.md)                      | A published, live git-state session (`GitAPI.watchRepo`)           | 2026-08-12 | accepted |
| [0038](./0038-navigator-view-list.md)                         | The Navigator lists its views instead of hiding them               | 2026-08-13 | accepted |
| [0039](./0039-self-contained-agent-docs.md)                   | Self-contained agent docs, no external skill dependency            | 2026-08-15 | accepted |
| [0040](./0040-skills-canonical-location-symlink.md)           | Skills live in `.agents/skills/`, `.claude/skills/` symlinks       | 2026-08-16 | accepted |
| [0041](./0041-pi-hook-as-installed-extension.md)              | Pi's session hook ships as an installed TypeScript extension       | 2026-08-22 | accepted |
| [0042](./0042-agent-catalog-modularization.md)                | Agent catalog modularization and declarative runtime policy        | 2026-08-22 | accepted |
| [0043](./0043-opencode-tiered-support.md)                     | OpenCode: zero-install activity now, resume deferred               | 2026-08-26 | accepted |
| [0044](./0044-navigator-stacked-arrangement.md)               | The Navigator can stack its views instead of one at a time         | 2026-08-27 | accepted |
| [0045](./0045-ephemeral-change-planning.md)                   | Substantial changes are planned in an ephemeral proposal expansion | 2026-08-30 | accepted |
| [0046](./0046-never-delete-user-data-unprompted.md)           | The host never deletes user data without asking                    | 2026-08-30 | accepted |
| [0047](./0047-cli-command-grammar.md)                         | CLI command grammar: an agent-first `silo` namespace               | 2026-09-01 | accepted |
| [0048](./0048-navigator-unscoped-chrome-on-workspaces-row.md) | Unscoped Navigator chrome rides the Workspaces row                 | 2026-09-02 | accepted |
| [0049](./0049-control-api-transport-and-authorization.md)     | The Control API: OS-gated socket, closed operation allowlist       | 2026-09-03 | accepted |
| [0050](./0050-replay-is-tagged-not-filtered.md)               | Reattach replay is tagged on the wire, not filtered out            | 2026-09-03 | accepted |
