---
status: implemented
created: 2026-09-09
---

# 0039. Host-drawn chrome for a dock panel

## Summary

An editor gets host-drawn chrome — a breadcrumb and a contribution point — so
`silo.markdown-preview` renders a body and nothing else. A dock panel used to
get a bare frame, so a panel that wanted the same strip reached sideways into
`extensions-core` for the `Breadcrumb` component. That worked for a bundled
panel and was unavailable to anyone else — `@silo-code/extensions-silo` and an
example both depend on `@silo-code/sdk` alone.

This put dock panels on the editor's seam: a `DockPanelKind` declares
`toolbar: { breadcrumb: true }`, publishes its path through
`DockPanelApi.setBreadcrumb(...)`, and the host frames it. `"panel"` **replaced**
`"editor" | "terminal"` on `ToolbarSurface` for dock panels — one surface, with
a `{ panelId, kindId, params }` target — so every dock-panel toolbar goes
through one contribution path and one host-drawn strip. Nothing new was exported
to the design-system kit — the public additions are a declaration, a setter, and
a surface name.

The ACP chat panel was the proving consumer. It moved out to
`examples/extensions/acp-chat` and the bundled `core.acp-chat` was deleted —
which is RFC 0038 acceptance criterion 2 met by the shipping UI rather than a
demo written beside it. That move also retired the `chatAgents` setting:
`ctx.agents.sessions` became a declared `"agents"` permission instead.

## Motivation

### The seam an editor sits on, and the one a dock panel sat on

`EditorPanel` (`core.*`, privileged) draws a breadcrumb + view switcher +
contribution point around whatever editor an extension registers, so
`silo.markdown-preview` never constructs chrome. A **dock panel kind** got none
of it: `DockPanelKind.component` rendered into a bare frame, so `core.terminal`
and `core.acp-chat` both imported `../editor/Breadcrumb` directly. Legal inside
`extensions-core`, invisible because both were bundled — and a hard blocker the
moment a panel needed to live outside that package.

### The forcing case

RFC 0038's chat panel is deliberately replaceable — `DockPanelKind.chatProfileHost`
is public and the `+` menu routes through `resolveChatProfileHost`. So the
routing was already open; the chrome was not. A third party could claim
`chatProfileHost` and then discover it could not draw the header the bundled
panel drew, and that no one could contribute a toolbar item to its panel because
`ToolbarSurface` had no name for it.

Moving the chat panel to `examples/extensions/` — so it iterates without a Silo
release — was blocked on exactly this, and the blocker was not incidental: **a
panel advertised as replaceable whose chrome cannot be reproduced from the
public surface is only half-replaceable.**

### Why the host draws it rather than exporting a component

The alternative — export the strip as an SDK `<PanelToolbar>` — is the smaller
change and the worse contract:

1. **It is the shape editors already have.** One seam to learn, not two.
2. **It exports data, not components.** A declaration plus a setter commits to
   no layout, height, or border, so the strip can be restyled without an SDK
   major.
3. **It removes the private door.** With the host drawing the strip, a
   first-party panel's own controls arrive the same way a third party's do —
   `registerToolbarItem({ surface: "panel" })`. There is no `children` prop to
   slip past the contribution point, so the bundled panel is a real test of the
   contribution API rather than a privileged consumer beside it. This is the
   failure RFC 0038's Session 3.8 named: a workaround inside the reference
   implementation looks like a feature to everyone downstream.

## Final design

### The SDK surface (all additions to existing `@public` types)

```ts
interface DockPanelKind {
  toolbar?: { breadcrumb?: boolean };
}

interface DockPanelApi {
  setBreadcrumb(
    crumb: {
      filePath: string;
      workspaceFolder?: string;
      leafIcon?: "file" | "folder";
    } | null,
  ): void;
}

// "terminal" is gone — the terminal is a dock-panel kind, so its items are
// scoped "panel" items. "editor" / "navigator" stay (not dock panels).
type ToolbarSurface = "editor" | "navigator" | "panel";

interface ToolbarItemContext {
  panel: {
    panelId: string;
    kindId: string;
    params: Readonly<Record<string, unknown>>;
  };
}

// Permission gains "agents" alongside fs:read / fs:write / process / network / webview
type Permission =
  | "fs:read"
  | "fs:write"
  | "process"
  | "network"
  | "webview"
  | "agents";
```

- `toolbar: {}` reserves the strip for a panel that wants only contributed
  items; omitting `toolbar` keeps today's bare frame.
- `setBreadcrumb` is modelled on `setAgentSession(id | null)`: the panel states a
  fact about itself, host chrome routes on it, and the panel never learns what
  chrome exists. `null` renders no path crumbs (also how a panel honours a
  "hide breadcrumbs" setting of its own) — distinct from "not declared yet",
  which draws a placeholder so the strip does not jump. The path is not part of
  the panel's persisted identity, so it goes here, not through `params`.
- `kindId` is in the toolbar target because a dock panel could be any kind: an
  item only meaningful on a chat panel scopes itself with
  `when: (_keys, t) => t.kindId === "acp-chat"`. `params` (the panel's own
  `DockPanelProps["params"]`, read-only) is there so a terminal item reads
  `t.params.terminalId` without a lookup the SDK does not offer — RFC open
  question 1, answered by the first real item that needed it.

### Host implementation

- **`Breadcrumb` + `ContributedToolbar` moved** from `packages/extensions-core/`
  into `packages/extension-host/src/panels/`. Pure move. They stay **private** —
  re-exported from `@silo-code/extension-host/internal` only so `EditorBreadcrumb`
  and `TerminalPanel` (both in `extensions-core`, which depends on the host)
  keep resolving them. Nothing about the toolbar registry became public — only
  its rendered result, inside chrome the host draws.
- **`panel-chrome-registry.ts`** — `panelId → crumb`, per-panel subscription
  (mirrors `agent-surface-registry.ts`). `dock-panel-kinds.ts`'s
  `makeDockPanelApi` records `setBreadcrumb` into it; `toHostComponent` frames a
  kind that declares `toolbar` in `.dock-panel-frame` with `DockPanelChrome`
  above the body, and clears the crumb on unmount.
- **`DockPanelChrome`** renders `<Breadcrumb>` (from the registry) +
  `<ContributedToolbar surface="panel" target={{ panelId, kindId, params }}>`,
  opening menus through the host's `openMenu`. A bare stretch flex wrapper with
  no border of its own — `Breadcrumb` and `ContributedToolbar` each bring the
  one bottom rule, so there is no double border (the bug `24aeaba3` fixed for
  the bundled panel). **One strip per panel** — a panel never renders a toolbar
  of its own, so a contribution can never land on a second row.

### The chat panel is an example, not a bundle

`examples/extensions/acp-chat` — the real panel (~1,350 lines across
`AcpChatPanel.tsx`, `transcript-model.ts` and five small pure modules, all
co-located Vitest) moved verbatim. It declares `chatProfileHost: true`,
`toolbar: { breadcrumb: true }`, and `silo.permissions: ["agents"]`; it resolves
`@silo-code/sdk` alone, with `react-markdown` / `remark-gfm` in its own bundle.
CSS is loaded as a string (`loader: { ".css": "text" }`) and injected into a
`<style>` tag, the pattern `agent-inspector` established. Its tests run under
`turbo run test` (the package has a `test` script), so no coverage was dropped.

**The bundled copy was deleted, not kept beside it.** Two copies of a large
panel is two things to keep in step, and the bundled one would win
`chatProfileHost` by registration order anyway. A default install ships no Chat
UI for now — acceptable because the feature is work-in-progress; it moves back
in-tree when it is good enough to be a default.

Phase 5 was the real test of the boundary, and it held: `tsc --noEmit` on the
example passes, which is only possible if nothing resolves from
`@silo-code/extension-host/internal` — the example does not depend on the host
package, so a reach into internals fails to resolve rather than passing review.

### `core.terminal` is the second consumer

`core.terminal` declares `toolbar: { breadcrumb: true }` and publishes its live
cwd through `setBreadcrumb`; `terminalSettings.breadcrumbs` off is
`setBreadcrumb(null)`. A one-consumer abstraction is a guess — the terminal is
what keeps the design from being shaped around the chat panel.

**`"terminal"` was removed from `ToolbarSurface`, not kept.** The terminal is a
dock-panel kind, so a terminal toolbar item is `surface: "panel"`,
`when: t => t.kindId === "terminal"`, reading `t.params.terminalId`. The
terminal panel renders **no toolbar markup of its own** — the host strip is the
only strip. The first attempt kept `"terminal"` and let the panel render its own
`<ContributedToolbar>`; verification showed that produced a visible second row
below the host breadcrumb (a `silo.follow-ups` flag on its own line), which is
exactly what the RFC set out to prevent. `ctx.registerToolbarItem` is stable, so
this drops one member of a stable enum — justified: `"terminal"` had one in-repo
consumer (`decoration-demo`, migrated here) and the split-strip regression is
not acceptable. `"editor"` / `"navigator"` stay — they are not dock panels
(`EditorPanel` keeps its own `ViewSwitcher` composition; RFC open question 4).

### The `chatAgents` setting retired

With nothing Chat-related bundled, a flag that hid an unfinished feature had
nothing left to hide. It gated five things:

1. **Bundled panel activation** — `chat-panel-gate.ts`, the inactive
   registration in `builtins.ts`, `applyChatAgentsGate` in `main.tsx`: all
   deleted. This mechanism was the sole reason for the "no boot-time branch may
   read an index-persisted setting" trap; that trap is now unreachable for this
   feature (it stays in the sprint plan for the next feature tempted by it).
2. **`connect()` rejecting when off** → the `"agents"` permission.
   `createAgentSessionsService` takes a `() => boolean` predicate that
   `context.ts` binds to the per-extension permission set; `getAgentsService()`
   returns `Omit<AgentsService, "sessions">` and `context.ts` composes
   `sessions` on. `KNOWN_PERMISSIONS` in `extension-manager.ts` gained
   `"agents"` and `PermissionConsent` gained its row.
3. **The profile editor's Interface radio** — **re-gated**, not un-gated, on
   `resolveChatProfileHost() !== undefined` (re-added to the internal barrel).
   Un-gating it would let a user with no Chat panel author a profile that cannot
   open — the authorable-but-unusable state Session 3.6 eliminated for `grok`.
   Deriving the offer from the registry is strictly better: a fact rather than a
   preference, self-healing, and resolved through the same function the launch
   path uses, so the editor and the launch cannot disagree. An **existing** Chat
   profile still edits as one (the `|| isChat` at the radio's call site).
4. **The Settings → Agents toggle row** — deleted.
5. **`startAgentProfile`'s refusal** when nothing claims `chatProfileHost` —
   already a registry read, unchanged.

The persisted `chatAgents` key is dropped defensively: `hydrate()` ignores it,
`writeIndex` no longer emits it, so an old index carrying `chatAgents: false`
resurrects nothing.

**`process` deliberately does not cover `"agents"`.** An ACP child is spawned by
the host from a user-authored profile, not by the extension through
`ctx.process`.

## Requirements that still matter

- A dock panel gets host-drawn chrome only when it declares `toolbar`; every
  other kind is unaffected.
- `setBreadcrumb` and `setAgentSession` are the same shape, and both withdraw on
  unmount.
- A `"panel"` toolbar item without a `kindId` guard shows on every panel that
  has a strip — the guard is the contract. A panel never renders a toolbar of
  its own; every dock-panel toolbar item is a `"panel"` item and lands in the
  one host-drawn strip.
- `examples/extensions/acp-chat` must build and run resolving `@silo-code/sdk`
  alone; a reach into `extension-host/internal` there is a finding to fix in the
  surface, never to route around.
- The Interface: Terminal / Chat choice is offered iff a Chat panel is installed;
  an existing Chat profile edits as one regardless.
- `ctx.agents.sessions.connect()` throws without the `"agents"` permission.

## Verification

Gates green: `pnpm test` (all packages, incl. `acp-chat`), `tsc --noEmit`,
`pnpm lint`, `pnpm docs:build`, `pnpm docs:api` regenerated. Live, against the
dev app: the terminal breadcrumb is host-drawn and the `terminalSettings.
breadcrumbs` toggle is `setBreadcrumb(null)`; the installed `acp-chat` example
renders a strip with one border (not two) visually identical to the bundled
panel, and a third-party `silo.agent-inspector` reads its session through
`ctx.agents`; a contributed `surface: "panel"` item with `when: t => t.kindId
=== "acp-chat"` appears and one scoped to a different kind does not; with the
example disabled, `resolveChatProfileHost()` is `undefined` so a new profile
gets no Interface choice while an existing Chat profile still reports
`interface: "chat"`.

## Implementation references

- `packages/sdk/src/{types.ts,toolbar-items.ts,permissions.ts,agents-service.ts}`
- `packages/extension-host/src/panels/{Breadcrumb,ContributedToolbar,DockPanelChrome}.{tsx,css}`
- `packages/extension-host/src/extension-host/{panel-chrome-registry.ts,dock-panel-kinds.ts,context.ts}`
- `packages/extension-host/src/extension-host/agents/{acp-sessions-service.ts,agents-service.ts,chat-profile-host.ts}`
- `packages/extensions-core/src/{terminal,agents-settings,extensions}/…`
- `examples/extensions/acp-chat/`

## Related decisions

- RFC 0038 — ACP Agent Sessions (`ctx.agents.sessions`); this is its Session 3.9.
- RFC 0021 — toolbar contributions (`ToolbarSurface`).
- ADR 0015 — phased security model (`Permission`).
- ADR 0026 — the design-system kit has one public source; nothing here changed
  that.

## Follow-ups (not in this change)

- `silo.follow-ups` (in `silo-code/silo-extensions`, on published-SDK lag) still
  registers `surface: "terminal"` toolbar items; they no longer render. It needs
  the same `surface: "panel"` / `t.params.terminalId` migration once a `"panel"`
  SDK ships.
- `examples/extensions/*/src/**/*.css` is not covered by `pnpm lint:css` (the
  `silo/extension-design-tokens-only` rule) — the moved `acp-chat.css` passes
  it when run by hand, but the glob should be widened.
- Move the chat panel back in-tree once it is good enough to be a default
  (RFC 0038 acceptance criteria decide when).
