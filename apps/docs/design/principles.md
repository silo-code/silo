# Principles & best practices

The rules that keep every modal — first-party or third-party — reading as one
product. Written to be followed literally; when a rule says "never," a coding
agent should treat it as a hard constraint, not a style preference.

## 1. Every color comes from a theme token

Nothing in a modal is a literal color. Backgrounds, text, borders, tints — all
derive from the [design tokens](/api/theming), directly (`var(--silo-color-…)`)
or by formula (`color-mix()` off a token). That's what makes a modal correct in
all five bundled themes _and_ themes that don't exist yet.

- ✅ Components do this for you. Using the kit means never picking a color.
- ✅ If you write custom CSS around components, use design tokens only —
  see [Styling your extension](/guide/styling) for the token rules.
- ❌ Never hard-code a hex, and never consume component/internal tokens
  (`--silo-modal-*`, `--silo-internal-*`).
- The one sanctioned exception: `Badge` accepts an arbitrary identity color
  (`<Badge color="#e06c75">`) for things like user-chosen group colors — and
  even then the background tint is derived from it, not picked separately.

## 2. Never invent a text style

Every piece of text in a modal is one of the named [typography roles](/design/typography).
If you're reaching for `font-size` in CSS, stop and find the role instead.
Modal content is automatically one step larger than app chrome (the host
rebinds the size scale inside modals) — you inherit that for free; don't
compensate for it.

## 3. Keyboard support is built in — don't rebuild or break it

- `List` (and row collections generally) are **one tab stop**: ↑/↓ move a
  focus ring row to row, Space/Enter selects. This ships inside the component.
- Tab strips (`Tabs`, `SegmentedTabs`) and `RadioCard`s are **plain tab
  stops** — each control tabs individually. No arrow-key roving. This is
  deliberate; don't add roving to them.
- The modal's close ✕ is **not** a tab stop — Escape is the keyboard path for
  closing. Don't add your own close button to modal content.
- `InlineEdit` uses two-stage Escape: first Esc cancels the edit, next Esc
  closes the modal. The host coordinates this; don't intercept Escape
  yourself for anything else.

## 4. One focus ring, owned by the system

Every focusable control gets the same 1px inset accent ring. **Never hand-roll
a focus style** — a local `:focus` rule stacks a second ring on top of the
shared one. If you must suppress a native outline on a custom element, use
`outline: none` and let the system ring take over.

## 5. Pressed states are part of the language

Buttons, icon buttons, and add-rows visibly respond to click (a darker fill
plus a slight scale). Disabled controls are inert — they don't hover, don't
animate, don't receive clicks. The kit handles both; if you build a custom
clickable element, match this or (better) ask for the component you're missing.

## 6. Compose the shell's slots — don't fight the shell

The host owns the modal shell ([`ctx.ui.showModal`](/api/ui/)): backdrop,
title, sizing (`sm` 400px / `md` 560px / `lg` 800px), dismissal, focus trap,
z-stacking. Your content fills it:

- Footer actions go in `ModalActions` — right-aligned buttons, with the
  optional `start` slot for meta text or a secondary action. Never build a
  custom flex footer.
- Scrollable regions get `.silo-scroll` — never a custom scrollbar.
- Explanatory copy gets `Callout` (bordered, colorless) — it is **not** an
  alert box. Status belongs to `Badge` tones and `EmptyState`.

## 7. Semantic color is a vocabulary, not a palette

`ok` / `warn` / `err` / `accent` / `neutral` are the only tones. Pick the
closest one; never invent a new tint for a status. If none fits, that's an RFC
conversation, not a `color-mix` in your extension.

## Quick do / don't

| ✅ Do                                                | ❌ Don't                                 |
| ---------------------------------------------------- | ---------------------------------------- |
| Import components from `@silo-code/sdk`              | Copy a component's markup and restyle it |
| Use `ModalActions` (+ `start` slot) for every footer | Hand-roll a `display: flex` footer       |
| Use the closest `Badge` tone                         | Invent a new status color                |
| Let `List` provide keyboard navigation               | Attach your own key handlers to rows     |
| Put long explanations in a `Callout`                 | Use a `Callout` as a warning/error box   |
| Apply `.silo-scroll` to overflow areas               | Style `::-webkit-scrollbar` yourself     |
| Report a component gap to the Silo repo              | Patch over a gap with local CSS          |
