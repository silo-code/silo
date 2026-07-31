---
status: accepted
date: 2026-07-31
---

# 0030. Activity as first-class chrome

## Context

Ephemeral “busy / ready / warn / error” signals appear in several places —
workspace status rows, CenterDock tabs, and (planned) SideDock tabs. Tab
adornments briefly modeled this as free-form `animation` presets (`spin`,
`radar`, `pulse`, …) with optional extension-chosen colors. That invited
inconsistent glyphs and colors, and duplicated the pinned status-dot language
already used on workspace rows.

`AgentActivity` (`working` | `idle` | `error` | …) describes agent runtime
state; chrome needs a small overlapping vocabulary that paints the same way
everywhere.

## Decision

1. **`Activity`** is a first-class UI chrome kind:
   `"working" | "ready" | "warn" | "error"`.
2. The host owns glyph, motion, and color. Extensions never pass `icon`,
   `color`, or `animation` for activity. Colors are a **pinned light/dark
   palette** (today’s `--ws-status-*` values), not per-theme-preset
   `--silo-color-*` tokens — so `working` is recognizably blue across the app
   within a theme.
3. Paint is size-scaled by placement (`sm` ≈ workspace 6px, `md` ≈ CenterDock
   tabs) via a public SDK `ActivityGlyph` component (same `.silo-activity*` class
   contract as the rest of the kit).
4. **CenterDock** gets adorn verbs `setActivity` / `clearActivity` /
   `flashActivity` / `bindActivity` on `ctx.editors` and `ctx.terminals`.
   Tab `animation` presets are removed; trailing **indicators** stay
   static Phosphor marks only.
5. **Workspace status rows** use `activity?: Activity` instead of
   `status?: "ok"|"warn"|"busy"|"error"`. Omitting `activity` keeps the gray
   neutral (“none”) fallback — that look is **not** an Activity kind.
6. Mapping from today’s dots: `busy`→`working`, `ok`→`ready`, `warn`/`error`
   unchanged. From `AgentActivity`: `working`→`working`, `idle`→`ready`,
   `error`→`error`; `none`/`dead` paint nothing (`activityFromAgent` helper).
7. Side-panel owner `setActivity` is specified in RFC 0022; not required to
   land with this ADR.

## Consequences

- One recognizable activity language across surfaces; Decos and extensions
  stop inventing spinners.
- Breaking for unreleased tab-animation / workspace-`status` call sites on this
  branch — migrate to `activity`.
- Agent state machine unchanged (`idle` stays on `AgentActivity`).

## Alternatives considered

- **Keep `done` as an Activity kind** — rejected; gray settled look stays the
  workspace omit fallback only.
- **Extension-chosen color on activity** — rejected; breaks cross-app
  recognition.
- **Rename `AgentActivity` to match chrome** — deferred; map with a helper.

## References

- ADR 0029 (adornments vs registration)
- ADR 0026 (SDK component set)
- ADR 0028 (sealed agent detection / `AgentActivity`)
- RFC 0022 (side-panel tab adornments)
