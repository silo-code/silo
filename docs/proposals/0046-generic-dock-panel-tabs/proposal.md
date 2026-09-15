---
status: accepted # draft | accepted | implemented | rejected | superseded-by NNNN
created: 2026-09-14
---

# 0046. Generic dock-panel tabs — rename, tab menu, working folder

## Summary

A terminal tab can be renamed, carries extension-contributed context-menu items, and
picks its working folder when the workspace has more than one. A Chat panel tab does
none of these — right-clicking it does nothing at all. This proposal gives those three
behaviors to **every dock panel**, as host chrome keyed off declarative
`DockPanelKind` properties, rather than teaching the bundled Chat panel three new
tricks.

## Motivation

The Chat panel is a replaceable extension. `resolveChatProfileHost` calls
`chatProfileHost` "a declaration, not a privilege" — a third-party Chat panel claims
the job exactly as the bundled `silo.agents-chat-panel` does, and the profile editor
offers the Chat arm only when _some_ installed kind claims it. If tab rename and the
tab menu were implemented inside our panel, every alternative panel would have to
re-implement them, and Silo's answer to "why can't I rename this tab?" would depend on
which extension the user happened to install.

All three surfaces are already host-owned — `DockTab.tsx` draws every tab,
`terminal-tab-menu.ts` lives in the host, and `startAgentProfile` is the single
dispatch behind every "start this profile" gesture. So the gap isn't missing extension
capability; it's host behavior that was only ever wired for two of the three tab
species. `DockTab.onTabContextMenu` opens with `if (!editorId && !terminalId) return;`,
which is why a panel tab has no menu whatsoever.

The working-folder gap is sharper than cosmetic. A Chat session launches in the
workspace's **primary** folder, unconditionally — `extraFolders` are never consulted.
In a multi-root workspace there is currently no way to run an agent against the second
repo, while a terminal agent started from the same menu prompts for it.

## Proposed solution

Three changes, all in the host, none keyed off a panel-kind id:

1. **A `"panel/tab"` menu surface.** New `MenuSurface` member whose `MenuContext` is
   `{ panelId, kindId, workspaceId, params }` — the exact shape
   `ToolbarItemContext["panel"]` already uses for panel toolbar contributions, where
   an item scopes itself with `when: (_keys, t) => t.kindId === "…"`. `DockTab` grows a
   third branch that builds this menu.

2. **Rename via a host-owned `DockPanelRecord.customTitle`,** with a new
   `DockPanelKind.renamable` flag defaulting to `persistence === "recorded"`. The
   override is a sibling of `record.state`, never inside it — `state` is the panel's
   own contract. `DockTab` renders `customTitle ?? title`, so a panel that keeps
   calling `setTitle` never clobbers the user's rename.

3. **The folder picker hoisted in `startAgentProfile`,** above the Terminal/Chat arm
   split, threaded into the panel's params as `cwd`. Both entry points (the `+` menu
   and `core.newAgent.<id>`) inherit it, as does any kind declaring `chatProfileHost`.

## Scope

**In:** the three behaviors above, generically for all dock panels; the Chat panel
consuming `params.cwd`; the public SDK additions needed to express them.

**Out:**

- Renaming the underlying **agent session**. A tab name and a session name are
  different things (see `requirements.md` "Out of scope").
- Changing `DockPanelApi.setTitle`'s contract. It stays an unconditional pass-through.
- Changing a panel's working folder _after_ creation — terminals don't offer that
  either, and parity is the goal.
- Folding `EditorRecord` / `TerminalRecord` into `DockPanelRecord` (still deferred, per
  RFC 0041).

## Alternatives considered

**Intercept `DockPanelApi.setTitle` host-side** so a rename wins no matter what the
panel does. Rejected: it changes the behavior of a public SDK method for every existing
caller, and it is unnecessary — `DockTab` is the only consumer of a panel's title in
the app, so overriding at render time achieves the same visible result with no contract
change.

**Store the custom title inside `record.state`.** Rejected: `state` is documented as
the panel kind's own bag, shallow-merged from `updateParameters`, so a panel writing
its own state could erase a host-owned key living there.

**Gate rename on a kind-id allowlist, or on `chatProfileHost`.** Rejected as the exact
special-casing this proposal exists to avoid.

**Blanket rename for every recorded panel with no opt-out.** Deferred rather than
rejected — it is what ships today in effect, since only the Chat panel declares
`persistence: "recorded"`. The `renamable` flag exists so that a recorded panel which
_shouldn't_ be user-nameable (Output, when it eventually becomes recorded) has a way to
say so without the host learning its name.
