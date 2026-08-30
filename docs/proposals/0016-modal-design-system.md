---
status: implemented
created: 2026-07-18
---

# 0016. Modal design system: a public SDK component set

> **Implemented.** The kit shipped in the public `@silo-code/sdk` and is
> documented at [getsilo.dev/design](https://getsilo.dev/design/). ADR
> [0026](../decisions/0026-sdk-component-set.md) records the crystallized
> decision — one source for the components with no internal fork, the
> chrome-vs-content line, and the version asymmetry between first-party (HEAD)
> and third-party (last published SDK) consumers.

## Summary

Promote a curated set of presentational React components into `@silo-code/sdk`
so bundled and third-party extensions build modal content from one shared kit
instead of hand-rolling markup and CSS. The kit's visual design was developed
and approved interactively (per-component sign-off against a live mockup built
from the real `--silo-*` tokens); this RFC records the resulting inventory, the
class/token contract, the typography scale, the keyboard contract, and the
host-side changes the kit requires. Scope is **modal content** first — panels,
status bar, and other surfaces adopt later.

## Motivation

Silo ships ~13 modals that have visibly drifted: three different input styles
(`.silo-modal-input` 4px/8px on `bg-hover`, `.ws-rename-input` 6px/8px,
`.git-branch-search` 6px/8px on `input-bg`), three navigation patterns (the
settings rail, `.ext-tabs`, and `.ws-props-tabs` — the latter a hand-copied
clone of the former, while `.sms-tabs` in the external system-monitor extension
is a byte-for-byte copy of `.ws-props-tabs`), two footer conventions, and
per-modal badges, list rows, section headers, and spacing rhythm.

There is no shared component library: ADR 0005 keeps `@silo-code/ui` private,
and extensions author raw markup inside `ctx.ui.showModal`. Every new modal —
first-party or third-party — re-derives the design language by imitation, and
every visual tweak has to be re-applied N times. A coding agent asked to "add a
modal that blends in" has nothing normative to read.

## Design

### Distribution: components ship in `@silo-code/sdk`

Components are exported from the SDK barrel, following the `Tooltip` precedent
exactly:

- **Markup + behavior in the SDK** (`packages/sdk/src/components/`), styled
  purely via **host-provided `.silo-*` classes** — no stylesheet import, no
  runtime style injection from the SDK.
- Extensions already externalize `react`, `react/jsx-runtime`, and
  `@silo-code/sdk` in their esbuild config, so at runtime the components
  resolve to the **host's copy** — no version skew, no duplicate React, no
  build-config change for existing extensions.
- Admission bar (enforced by review): presentational only, no host valtio
  stores, no dependencies beyond `react`/`react-dom`, keyboard behavior only
  via the already-public `useFocusGroup`/`focusGroupNextIndex` or pure helpers.
  `<Modal>` itself stays host-internal (ADR 0018 unchanged) — the kit is modal
  _content_; the shell remains `ctx.ui.confirm`/`prompt`/`showModal`.

### The propagation contract (two independent update paths)

- **Visual tweaks** (colors, spacing, radii, the `.silo-*` class rules) live in
  the **host app** (`theme.css` + a new `components.css`). Extensions never
  bundle this CSS — a restyle ships in a Silo app update and applies to every
  installed extension instantly. No SDK bump, no extension rebuild.
- **Component behavior/props/markup** live in the SDK as real code. New
  components or props require an extension to bump `@silo-code/sdk` and
  republish. The contract is **additive-only** within a major version: no
  renames or removals of props or of contract classes.

### The class contract

Every `.silo-*` class a component renders is public API; renames are breaking.
Class-string mapping helpers are pure functions pinned by unit tests, so a
rename fails CI rather than shipping silently.

### Component inventory (all approved)

Props sketches; `React.ComponentProps<...>` pass-through where natural.

| Component                  | Props (sketch)                                                                                     | Notes                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`                   | `variant?: "normal"\|"primary"\|"danger"; size?: "normal"\|"sm"` + button props                    | Existing CSS classes; `:active` = 75% mix + `scale(0.97)`; disabled = `opacity .5` + `pointer-events: none` (danger included)                                                                                                                                                                                                                                                                      |
| `IconButton`               | `size?: "normal"\|"sm"` + button props; `aria-label` required                                      | 32px default (standalone), 26px `sm` (inline/tight, e.g. a `ListRow` trailing slot — one example, not the only one); pressed = `bg-active` + `scale(0.92)`                                                                                                                                                                                                                                         |
| `Input`                    | `block?: boolean` + input props                                                                    | One treatment: `input-bg`, 6px 8px, `radius-sm`                                                                                                                                                                                                                                                                                                                                                    |
| `Textarea`                 | textarea props                                                                                     | Input's tokens + `line-height 1.5`, vertical resize, 64px min-height                                                                                                                                                                                                                                                                                                                               |
| `SearchInput`              | `value; onValueChange; placeholder?; autoFocus?; onClear?`                                         | Leading icon + clear button (clear stays a tab stop)                                                                                                                                                                                                                                                                                                                                               |
| `InlineEdit`               | `value; onSave; validate?; multiline?; aria-label`                                                 | Generalizes `EditableWorkspaceName`: pencil → field (focused+selected) + explicit ✓/✗; Enter saves (multiline: ⌘/Ctrl+Enter, plain Enter = newline); invalid ⇒ inline error, no save; **two-stage Esc** (see host contract)                                                                                                                                                                        |
| `Select`                   | select props                                                                                       | Input's tokens                                                                                                                                                                                                                                                                                                                                                                                     |
| `Switch`                   | `checked; onChange; disabled?; aria-label`                                                         | Off track = `bg-active` + 1px `border-strong` border; on = `accent`, border transparent; white thumb                                                                                                                                                                                                                                                                                               |
| `CheckboxRow`              | `label; checked; onChange; disabled?`                                                              | 15px checkbox, `accent-color: accent`                                                                                                                                                                                                                                                                                                                                                              |
| `SegmentedTabs`            | `tabs: {id; label; icon?}[]; active; onSelect`                                                     | Pill-in-recessed-well (`content-bg` well, `button-bg` active pill); inactive hover = `bg-hover`; **native tab stops per segment** (no arrow roving)                                                                                                                                                                                                                                                |
| `Tabs` / `TabPanel`        | `tabs; active; onSelect`                                                                           | Borderless-only strip attached to its panel — active tab background **is** the panel background; consolidates `.ws-props-tabs` + `.sms-tabs`; native tab stops                                                                                                                                                                                                                                     |
| `RadioGroup` / `RadioCard` | `value; onChange` / `value; title; description`                                                    | Card = full click target; resting border transparent; selected = `accent` border + 8% tint; native tab stops                                                                                                                                                                                                                                                                                       |
| `List` / `ListRow`         | `aria-label; onActivate?` / `selected?; leading?; trailing?; truncate?: "end"\|"start"; onSelect?` | Stretches full-width (`min-width: 0` through the flex chain — content never pushes past the parent edge; trailing badges `flex-shrink: 0`); front-truncation via the RTL trick; **roving focus**: one tab stop, ↑/↓ move, Space/Enter select, focus survives re-render                                                                                                                             |
| `AddRow`                   | `onClick` + children                                                                               | Ghost action row flush with a list; hover `bg-hover`; pressed `bg-active` + `scale(0.98)`                                                                                                                                                                                                                                                                                                          |
| `Badge`                    | `tone?: "neutral"\|"accent"\|"ok"\|"warn"\|"err"\|"outline"; size?: "sm"\|"md"; color?: string`    | Tones derive from generics (text = tone color, background = 18–20% `color-mix` tint); `accent` uses `--silo-color-accent` (not accent-2); `color` = arbitrary caller color via one custom property (`--badge-color`), same tint derivation — for identity colors (e.g. workspace-group swatches). Font sizes are absolute chrome tokens only (`md` = chrome−1, `sm` = chrome) — never parent `em`. |
| `EmptyState`               | `icon?; tone?: "ok"\|"neutral"; title; description?; action?`                                      | Big circled icon + title + dim description; **no shadow/card of its own** — it lives in the modal body                                                                                                                                                                                                                                                                                             |
| `Callout`                  | children                                                                                           | Quiet set-off box for explanatory copy: hairline `border-strong` border only — no fill, no tone. Not for status/alerts (Badge/EmptyState territory)                                                                                                                                                                                                                                                |
| `Section`                  | `label; accessory?` + children                                                                     | Uppercase letter-spaced label at chrome−1                                                                                                                                                                                                                                                                                                                                                          |
| `SettingRow`               | `label; hint?; enabled?; dependent?` + children (control)                                          | Title (base/`text-hi`) + hint (sm/`text-lo`) left, control right, `border-strong` row dividers. `enabled`/`dependent` (added post-launch, see below) nest gated sub-settings under the hint                                                                                                                                                                                                        |
| `ModalActions`             | `start?` + children                                                                                | Right-aligned actions; optional left `start` slot (meta text or secondary action) replaces bespoke space-between footers. Promoted from host `Modal.tsx` into the SDK                                                                                                                                                                                                                              |

**`SettingRow` dependent sub-settings (added 2026-08-27, additive within this
RFC's own "new props" contract — no new component, no new RFC)** — settings
pages had accumulated three different hand-rolled shapes for "a control that
only makes sense while a sibling toggle is on" (Collapse older agents' cutoff
input, Share side panel layout's checkbox, each with its own one-off CSS for
what should have been one pattern). `SettingRow` gained two props: `enabled?:
boolean` and `dependent?: ReactNode`. `dependent` renders below the hint, in
the label/hint column, inside a native `<fieldset disabled={enabled ===
false}>` — the browser auto-disables every focusable descendant with no
per-child wiring, and `fieldset:disabled { opacity: .5 }` dims the whole block
in one rule. `enabled` is a plain boolean unrelated to whatever `children`
renders (a `Switch`, a `Select`, or nothing) — nothing requires the row to
have a toggle at all. The row's own layout is CSS grid, not flex: `dependent`
sits in its own grid row so it never affects how the control centers against
label+hint above it — a tall dependent block doesn't drag the control down
with it. The guide line is a `color-mix(in srgb, text-hi 30%, bg)` derivation
(this RFC's existing "derivation formula, not a new token" rule) rather than
`border`/`border-strong`: the plain `border` token is literally identical to
`bg` in at least one theme (invisible), and `border-strong` still read too
faint in review; deriving off `text-hi` guarantees real, correctly-signed
contrast (darker in light themes, lighter in dark ones) in every theme by
construction. 16px inset from the line to the content; 8px of bottom padding
so the line runs past the last child rather than stopping flush with it.
Ships in `packages/extension-host/src/layout/components.css` as
`.silo-setting-row-dependent`, no extension-side CSS required. First proven
internally (`@internal`, unstable, bundled-extensions-only) across four real
call sites — Collapse older agents, Play a sound, Share side panel layout, and
Enable/Threshold width under Laptop Mode (the last of these also fixed a
latent bug: Threshold width was never actually disabled when Laptop Mode was
off) — before this promotion to `@public`.

**Scrollbars** — a `.silo-scroll` class (not a React component) for scrollable
regions inside modals: 8px, transparent track, pill thumb
`color-mix(text 28%, transparent)` (45% hover). Deriving from the theme's text
color makes the thumb self-adjusting in every theme (a surface token failed in
Light: `button-bg` #e0e0e0 on the #e5e5e5 modal). Replaces the current 10px
outlined-pill scrollbar whose thumb turns _transparent_ on hover. Firefox via
`scrollbar-width: thin` + `scrollbar-color`.

### Tokens

- Implement the pre-whitelisted `--silo-list-*` group (`-radius`, `-inset`,
  `-hover-bg`, `-active-bg`, `-active-outline`) in `theme.css`, defaulting from
  generics.
- All other new colors are **derivation formulas** off existing design tokens
  (`color-mix`), not new tokens: badge tints, radio-card tint, tab hover,
  scrollbar thumb, button active fills. Open follow-up (non-blocking): promote
  badge tints to `--silo-badge-*` tokens if themes need to override them.
- No literal colors anywhere in the kit except deliberate constants
  (`#fff` button/switch-thumb foregrounds, caller-supplied `Badge color`).

### Typography (modal scale)

Modal content rides the existing `.silo-modal-scale` rebinding (base+1). Roles:

| Role                        | Size                               | Weight | Color                 |
| --------------------------- | ---------------------------------- | ------ | --------------------- |
| Title (`.silo-modal-title`) | **base+2**                         | 600    | `text-hi`             |
| Body                        | sm                                 | 400    | `text`                |
| Section label               | chrome−1, uppercase, letter-spaced | 400    | `text-lo`             |
| SettingRow label / hint     | base / sm                          | 400    | `text-hi` / `text-lo` |
| List row text               | sm                                 | 400    | `text-hi`             |
| Badge (`md`)                | chrome−1 (absolute, no cascade)    | 600    | tone color            |
| Badge counter (`sm`)        | chrome + pad `0 5px`               | 600    | tone color            |
| Footer `start` meta         | sm                                 | 400    | `text-lo`             |

**Change to today's host CSS:** `.silo-modal-title` moves from raw base
(currently _smaller_ than modal body content on the +1 scale) to base+2 —
titles outrank by size, not weight alone. The Settings rail header sits at
base/regular; the selected rail item gets weight 600.

### Keyboard contract

Keyboard behavior ships **inside the components**, not as caller homework:

- **Roving focus for row collections** (List, the host settings rail): one tab
  stop; ↑/↓ move a `data-focus-item`/`data-focus-visible` ring (the RFC 0012
  mechanism — not `:focus-visible`, which WebKit won't repaint for
  programmatic focus); Space/Enter select; focus survives the re-render a
  selection triggers.
- **Native tab stops for tab strips and radio cards** (SegmentedTabs, Tabs,
  RadioGroup) — each control is its own stop; no arrow roving. (Reviewed both
  ways; roving was rejected for these.)
- **One shared focus ring**: 1px accent, inset, on every focusable control
  (reduced from today's 1.5px). No component hand-rolls a ring. The Switch is
  the one offset exception (an 18px pill can't take an inset ring).
- **Pressed feedback everywhere**: `bg-active`-based fills + slight scale on
  Button/IconButton/AddRow; disabled controls are inert
  (`pointer-events: none`).

### Host-contract changes (in `extension-host`, not the SDK)

1. **Modal close ✕ leaves the tab order** (`tabindex="-1"`): mouse-only by
   design; Esc is the keyboard close path. (Today it's focusable.)
2. **Two-stage Esc**: the modal's Escape handler yields to an active
   `InlineEdit` — first Esc cancels the edit, next Esc closes the modal — the
   same cooperation `Modal.tsx` already grants open menus via `getMenu()`.
   This is what makes component-level Esc _reliable_; today's
   `EditableWorkspaceName` documents why it can't do this unilaterally.
3. `ModalActions` moves from `extension-host/Modal.tsx` to the SDK (it is a
   stateless div; `Modal` itself stays internal).
4. New `components.css` in `extension-host/src/layout/`, imported after
   `theme.css`, holding the kit's class contract; `.silo-modal-title` and the
   scrollbar treatment change as described; settings-rail chrome restyle
   (`SettingsDialog.css`).

### Stability

Components land as `experimental` on the roadmap and flip to `stable` when the
bundled-modal migrations complete. Docs pages carry the status badge. The class
contract versions with the SDK.

## Non-goals

- The `<Modal>` shell, backdrop, z-stack, and dismissal semantics stay
  host-owned (ADR 0018).
- The Settings **rail** stays host chrome — extensions register pages into it
  and never build rails; it is deliberately absent from the public kit.
- No `Table`/`TreeTable` (the Processes grid) and no chart/sparkline in v1 —
  documented as future primitives; those surfaces stay bespoke.
- No `FilterList` composite — the filter-input-above-list pattern is a
  documented recipe of `SearchInput` + `List`.
- Panels / status bar / side-panel surfaces: later phases; components are
  designed to generalize but only the modal surface is documented now.

## Alternatives considered

- **New public `@silo-code/ui` package** — cleaner separation, but a second
  publish pipeline, a new esbuild `external` entry in every extension, and a
  harder break with ADR 0005. The SDK route reuses proven plumbing.
- **CSS-classes-only contract** (no React) — zero API liability but every
  author re-implements markup, a11y, and keyboard; weakest blend-in guarantee
  and worst for coding agents.
- **Blanket roving focus for all groups** — rejected in review for tab strips
  and radio cards; kept for row collections.
- **Dedicated scrollbar/badge tokens** — deferred in favor of derivation
  formulas; promotable later without breakage.

## Decision

Accepted (design approved component-by-component against the live mockup,
2026-07-17/18). ADR 0026 records the promotion decision amending ADR 0005.
Implementation sequencing: tokens/class contract → SDK components (+ tests +
API docs) → bundled-modal migrations → gallery example extension → guides.
Roadmap tracks per-piece status.
