---
status: implemented # draft | accepted | implemented | rejected | superseded-by NNNN
created: 2026-09-10
---

# 0043. Chat panel visual polish — to the Paseo bar

## Summary

`silo.agents-chat-panel` is functionally complete (RFC 0038/0039/0040/0042) but
still reads as a spike: every tool call is a bordered card, turns have no
visual grouping or completion status, and the `/` command palette pushes the
composer down instead of floating over it. Dave named **Paseo**'s chat UI
(2026-09-09) as the concrete reference. This RFC characterises exactly what
Paseo does differently — from a screen recording and Paseo's own source, not
from memory — and specifies the changes that close the gap while staying on
`ctx.agents.sessions` + `@silo-code/sdk` kit components + `--silo-*` tokens.

## Motivation

Session 6 of the Agent Sessions sprint plan (`docs/acp-sprint-plan.md`, "The
Chat UI we are aiming at") is explicit that nobody had written down what Paseo
does better before this RFC — building UI against a guess was called out as
the mistake to avoid. This is that write-down, plus the design it licenses.

## Evidence

Screen recording: `~/Desktop/Screen Recording 2026-09-10 at 8.51.53 PM.mov`
(106s, captured 2026-09-10). Frame numbers below (`frame_NNN`) are extracted at
1.5s intervals — `frame_N` ≈ `(N-1) × 1.5s` into the recording.

Source: `/Users/dweaver/Projects/ai/xerro-agent/repos/getpaseo-paseo`
(`packages/app/src/composer/`, `packages/app/src/agent-stream/`,
`packages/app/src/components/ui/autocomplete*.tsx`), Expo/React-Native-Web,
readable (unminified) TypeScript. Every finding below is corroborated in both
the recording and the source — the source is what makes each finding
falsifiable rather than a description of a screenshot.

## Design

### 1. The turn: plain content, boxed only when it needs a decision

**Finding.** A user message is the only bubble (right-aligned, filled,
rounded). Everything the agent produces — thinking, tool calls, the final
answer — is plain, left-aligned text with no card, no avatar, no "Assistant"
label. Consecutive tool calls sit tightly stacked with almost no gap between
them; the gap opens up between _turns_, not between every entry. A tool call
only gets a bordered card when it is **blocked on the user** (a permission
request) — routine calls stay a one-line row: icon + tool label + the
command/target in muted text, e.g. `Shell  ls -la /Users/dweaver/…`. Once a
turn finishes, a small muted footer line appears directly under the last
content block, before the next user bubble: `Worked for 18s`, plus (not
adopted here — see Alternatives) copy/fork icons. While a turn is running, the
footer instead shows a live ticking elapsed time and a loading glyph.

- Video: `frame_043`/`frame_045` (~63–66s) — two `Shell` rows stacked with no
  border, then `Worked for 18s`; next turn's `Write README.md` row followed by
  a boxed permission card (finding 4).
- Source: `packages/app/src/agent-stream/turn-footer.tsx` (`TurnFooter`,
  `RunningTurnFooter` vs. `CompletedTurnFooterRow`) and
  `packages/app/src/components/message.tsx:637` — the exact string
  `` `Worked for ${formatDuration(durationMs)}` ``. `MAX_CONTENT_WIDTH = 820`
  (`packages/app/src/constants/layout.ts:15`) caps the whole column, bubble and
  plain text alike.

**Silo today** (`AcpChatPanel.tsx`, `acp-chat.css`): every `ToolEntry` renders
as `.acp-chat__tool` — a bordered, backgrounded card
(`acp-chat.css:98-106`) — and every entry, tool or message, gets the same 10px
gap (`.acp-chat__scroller { gap: 10px }`). There is no turn concept at all: no
grouping, no completion footer, no elapsed time.

**Change.**

- Group `Transcript.entries` into turns (a pure helper, `transcript-model.ts`):
  a turn starts at a `user` message and runs to (excluding) the next one;
  entries before the first user message form a leading, footer-less turn.
- Render each turn as `.acp-chat__turn`: the user bubble, then its remaining
  entries at a tight `4px` gap; `.acp-chat__scroller`'s own gap becomes the
  turn-to-turn spacing (kept at `10px`, now doing less work since it no longer
  also separates a `Shell` row from the text above it).
- Strip `.acp-chat__tool`'s border/background/padding for the default case —
  a single-line row (icon + title + muted inline detail, ellipsised). The
  permission card (already boxed, finding 4) is the one exception, unchanged.
- Add a turn footer: `Worked for {duration}` once a turn completes, a live
  ticking readout while it's running. Timing is tracked in the component (turn
  start/end aren't part of the wire protocol or the journal), not the pure
  reducer — a turn restored from the journal alone (no live timing recorded
  this session) simply shows no footer, which is the same "absent means
  nothing to say" tolerance the reducer already applies elsewhere.
- **Not adopted:** copy and fork/retry icons on the footer. Copy is easy
  (clipboard API, no `ctx` needed) but wasn't asked for and isn't evidenced as
  load-bearing; fork/retry-from-here has no `ctx.agents.sessions` counterpart
  (no "resend from message N" operation) — building it would mean inventing
  protocol behaviour, the opposite of this sprint's rule. Left as a future
  `ctx` gap if a later session wants it.

### 2. The composer: icon-and-pill affordances below the input, not a form row

**Finding.** The composer is one bordered surface containing the auto-growing
input and, below it, a single row of compact controls: a leading icon-only
`+` (opens **Add image / Add issue or PR / Upload file**), then labelled
pill+chevron buttons for model, reasoning effort, and permission mode, then
(right-aligned) a mic icon and send/stop. Nothing is a native `<select>` or a
permanently-labelled text button — every control is icon/pill + a
host-rendered floating dropdown that overlays the transcript rather than
reflowing the composer. The input's placeholder documents `/` and `@` inline:
`"Message the agent, tag @files, or use /commands and /skills"` — there is no
separate always-visible "Attach" button with that word on it.

- Video: `frame_060` (~88.5s, permission-mode dropdown), `frame_062` (~91.5s,
  effort dropdown), `frame_064` (~94.5s, model/provider picker), `frame_066`
  (~97.5s, the `+` attach menu and the full placeholder string).
- Source: `packages/app/src/composer/index.tsx` wires `DraftCommandConfig` /
  `resolveClientSlashCommand` into this same input; the pill-dropdown pattern
  itself is `ctx.ui.showMenu`'s exact Silo counterpart (see below).

**Silo today:** `.acp-chat__controls` is a plain row of kit `<Select>`s (chat
profile, each `AgentSessionConfigOption`) plus a text-labelled `<Button>`
("Attach"), all below the `<Textarea>` (`AcpChatPanel.tsx:855-926`).
Functionally equivalent, visually a settings form rather than a composer.

**Change.**

- Replace the profile `<Select>` and each config-option `<Select>` with
  `MenuButton` (`variant="bare"`) opening `ctx.ui.showMenu` — `items` built
  from `available`/`opt.options`, current value marked via `checked`, each
  `run` calling the existing `switchProfile`/`setConfigOption`. This is the
  documented kit pattern for exactly this case (`agents-service.ts`'s own
  doc example: "there is deliberately no `pick()` — build one from `list()`
  and `ctx.ui.showMenu`"), and it is what gives Silo the same anchored,
  non-reflowing dropdown feel Paseo's model/effort pickers have — a plain
  `<select>` cannot do that; its popup is native OS chrome, not the host's.
- Replace the "Attach" `<Button>` with an `IconButton` (a paperclip glyph from
  `@phosphor-icons/react`, already a direct dependency of sibling `silo.*`
  extensions — see `git-explorer`, `file-explorer`) wrapped in the SDK
  `Tooltip` ("Attach a file"), matching the icon-first, unlabelled affordance
  row.
- **Not adopted:** a literal `+` menu with "Add image" / "Add issue or PR"
  entries. Silo's attach affordance is one action (`ctx.ui.pickFile`); wrapping
  a single action in a menu to _look_ like Paseo's three-entry menu would be
  copying shape without the substance it exists for.
- **Not adopted:** recolouring Send/Stop as a circular red/green icon button.
  The kit has no semantic "danger-action-in-progress" token this would map to
  without a literal colour, which the design-tokens-only lint forbids; the
  existing labelled `Button` ("Send" / "Stop") already carries the same
  information through text instead of colour, and text is themeable, the
  colour is not, without a new token this session doesn't have grounds to
  invent.

### 3. The `/` palette: floats over the transcript, doesn't push the layout

**Finding.** Typing `/` opens a panel anchored to the composer's **top edge**,
overlaying the transcript above it rather than occupying flow space that
shoves the input down. Paseo's version additionally shows a small "detail"
card above the scrollable list — the _currently highlighted_ row's name,
description, and hint, in its own bordered box, separated by a small gap from
the list below.

- Video: `frame_053` (~78s) — what first looked like two separate list boxes
  is this detail-card-plus-list structure, confirmed against source below (not
  two competing matches, as the frame alone would suggest — this is exactly
  why the plan requires reading the source, not just the recording).
- Source: `components/ui/autocomplete-popover.tsx` positions the popover
  `position: absolute; bottom: hostHeight - anchorY + OFFSET_FROM_ANCHOR` (an
  offset of `SPACING[3]`) — directly above the anchor, full width of it, not
  in normal flow. `components/ui/autocomplete.tsx`: `outerWrapper` (`gap:
theme.spacing[1]`) holds an optional `detailCard` (`selectedOption`'s
  label/description/hint) above the `container` (the scrollable list,
  `maxHeight` default **220** — Silo's existing `200px` cap is already in the
  same neighbourhood, not a gap). Row styling: `minHeight: 36`, `paddingHorizontal:
spacing[3]`, `paddingVertical: spacing[2]`, selected/hovered → `surface2`
  background, container → `surface1` background with `borderAccent` border and
  `radius.lg`.

**Silo today:** `.acp-chat__command-palette` is a normal-flow sibling _above_
`<Textarea>` inside the same flex column (`AcpChatPanel.tsx:813-830`) — it
pushes the input down as it appears/grows, and shrinks the visible transcript
by however tall it is.

**Change.**

- Make `.acp-chat__composer` `position: relative` and
  `.acp-chat__command-palette` `position: absolute; bottom: 100%; left: 0;
right: 0;` with a small gap (`margin-bottom`), so it overlays the transcript
  instead of participating in the composer's own flex layout. Pure CSS — no
  portal, no new host capability.
- **Not adopted this session:** the detail card for the highlighted row.
  `List`/`ListRow`'s keyboard navigation is internal to `useFocusGroup`
  (`packages/sdk/src/use-focus-group.ts`) and exposes no "focus moved to row
  N" callback a consumer can read — building the detail card would mean either
  reaching around the kit (forbidden) or extending `List` itself, which is
  shared design-system-kit surface used by every extension, not a change one
  panel's session should make as a side effect. Left as a `ctx`/kit gap for
  whoever next wants it — noted here so it isn't rediscovered as a surprise.

### 4. The permission card — already right, confirmed rather than changed

**Finding.** A blocked tool call gets a distinct card: header (tool name),
a nested content-preview box, "How would you like to proceed?", then
Deny/Accept. This is materially what `.acp-chat__permission` already does
(title, note, action buttons) — the gap is presentational polish (finding 1's
"only box what's blocked" rule, which the permission card already satisfies)
rather than a missing structure.

- Video: `frame_045` (~66s) — `Write` card, `# Authors` preview, Deny/Accept.

**Change:** none beyond finding 1's tool-row cleanup around it (the compact
`Write README.md` row above the still-boxed permission card already reads
correctly once ordinary tool rows stop being boxed too).

## Alternatives considered

- **Rewrite the transcript rendering around Paseo's own turn/strategy model**
  (`agent-stream/strategy.ts`, `render-strategy.ts`) — rejected: that machinery
  exists to solve React Native virtualisation and cross-platform (native/web)
  rendering, neither of which applies to a DOM-only Silo extension. Only the
  _visual_ conclusions (grouping, footer, compact rows) transfer; the
  machinery that produces them does not.
- **A literal port of the `+` attachment menu's three entries** — rejected,
  see finding 2; Silo has one attach action, not three.
- **Extending `List`/`ListRow` with a focus-index callback to build the
  palette's detail card** — deferred, see finding 3; a kit change is out of
  this session's scope.

## Decision

Accepted and implemented 2026-09-10, same session. `pnpm test` / `pnpm --filter
silo exec tsc --noEmit` / `pnpm lint` all green. Live-verified against a real
`claude-chat` Claude Agent session in a throwaway sandbox workspace: turn
grouping + footer (two prompts produced two separately-footed `.acp-chat__turn`
blocks, the running one reading a bare live-ticking duration and the completed
ones `"Worked for 14s"`) and the floating `/` palette (`position: absolute`,
resolved rows) both confirmed via DOM query. The compact-tool-row change
(finding 1) was **not** live-verified — three consecutive prompts in that
session hit the same transient upstream failure (retry ×3, give up at 14s, no
tool call ever issued) — so it rests on the video/source evidence and
`groupTurns`/CSS unit coverage alone. See the Session 6 handoff in
`docs/acp-sprint-plan.md` for the full verification log and Dave's sign-off
against the recording, which should specifically re-check a live tool call now
that this proposal is implemented.
