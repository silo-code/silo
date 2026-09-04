# Silo Design System

A shared kit of React components, text styles, and interaction rules for
extension UI that looks and behaves exactly like Silo's own. Import the
components from `@silo-code/sdk`, compose them inside the surface you're
targeting, and your UI blends in — in every theme, at every font size, with
keyboard support you didn't have to write.

## Surfaces

An extension puts UI in one of several surfaces, and each follows its own
patterns — know which one you're building before you pick components:

| Surface                                                                                     | Registered with                                                                       | Status                                       |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------- |
| **[Modals](/design/surfaces#modals)** — standalone, settings pages, workspace property tabs | `ctx.ui.showModal`, `ctx.registerSettingsPage`, `ctx.workspaces.registerPropertyPage` | Documented below and throughout this section |
| **[Side panels](/design/surfaces#side-panels)**                                             | `ctx.registerSidePanel`                                                               | <Badge type="info" text="coming soon" />     |
| **[Status bar items](/design/surfaces#status-bar-items)**                                   | `ctx.registerStatusItem`                                                              | <Badge type="info" text="coming soon" />     |
| **[Dock panels & editors](/design/surfaces#dock-panels-and-editors)**                       | `ctx.registerEditor`, `ctx.registerDockPanelKind`                                     | <Badge type="info" text="coming soon" />     |

[Surfaces](/design/surfaces) covers each in depth, with the best practices
that differ between them.

## The two-lane update contract

The most important thing to understand about how the kit evolves:

| What changes                                   | Where it lives               | How you get it                                                                                                                                                                                                  |
| ---------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Colors, spacing, radii, any visual styling** | The Silo app (host CSS)      | **Automatically.** Your extension never bundles this CSS — it references class names the host styles. A restyle ships in a Silo update and applies to every installed extension on next launch. You do nothing. |
| **New components or props**                    | `@silo-code/sdk` (real code) | Bump your `@silo-code/sdk` dependency and republish. Existing builds keep working — the contract only ever adds within a major version.                                                                         |

Practical consequence: **never restyle a kit component locally.** Your
override freezes today's look and breaks the automatic-restyle lane. If a
component can't do what you need, that's a gap to report, not CSS to write.

## How to consume it

Extensions already externalize `react`, `react/jsx-runtime`, and
`@silo-code/sdk` in their build (see
[Your first extension](/guide/your-first-extension)), so the components resolve to
the host's own copy at runtime — nothing new to configure.

```tsx
import {
  Button,
  SearchInput,
  List,
  ListRow,
  Badge,
  ModalActions,
} from "@silo-code/sdk";

ctx.ui.showModal((close) => <MyPicker onDone={close} />, {
  title: "Branches",
  size: "md",
  dismissible: true,
});
```

## The component inventory

| Need                                         | Reach for                                               | Page                                                        |
| -------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------- |
| Action buttons (Cancel / Save / Delete)      | `Button`                                                | [Buttons](/design/components/buttons)                       |
| A small icon-only action (✕, ⋮, ↻)           | `IconButton`                                            | [Buttons](/design/components/buttons)                       |
| A button that opens a menu                   | `MenuButton`                                            | [Buttons](/design/components/buttons)                       |
| A text field                                 | `Input`, `Textarea`                                     | [Text inputs](/design/components/text-inputs)               |
| Filter-as-you-type over a list               | `SearchInput` + `List`                                  | [Text inputs](/design/components/text-inputs)               |
| Click-to-edit a value in place               | `InlineEdit`                                            | [Text inputs](/design/components/text-inputs)               |
| On/off, pick-one-of-few                      | `Switch`, `Select`, `CheckboxRow`, `RadioGroup`         | [Selection controls](/design/components/selection-controls) |
| Switch between views of content              | `Tabs`, `SegmentedTabs`                                 | [Tabs](/design/components/tabs)                             |
| Rows of selectable things                    | `List` / `ListRow`, `AddRow`                            | [Lists](/design/components/lists)                           |
| A status/identity pill                       | `Badge`                                                 | [Badges](/design/components/badges)                         |
| Busy / ready / warn / error dots             | `ActivityGlyph`                                         | [Activity](/design/components/activity)                     |
| "Nothing here" / explanatory copy            | `EmptyState`, `Callout`                                 | [Feedback](/design/components/feedback)                     |
| A hover label for an icon-only action        | `Tooltip`                                               | [Feedback](/design/components/feedback#tooltip)             |
| Group settings, footer actions, scroll areas | `Section`, `SettingRow`, `ModalActions`, `.silo-scroll` | [Structure](/design/components/structure)                   |

Not part of the kit (use your own rendering, scoped to your extension): data
tables/tree grids, charts and sparklines. There's also no combined
`FilterList` — compose `SearchInput` + `List` yourself; it's four lines.

`Tooltip` is the one entry above that isn't modal-scoped — it's app-wide
(status bar, panels, toolbars, _and_ modal content), so its full prop
reference lives at [`Tooltip`](/api/other/tooltip) rather than only on the
Feedback page. It's also the precedent the whole kit follows: a real
component in the SDK, styled entirely by host classes, no stylesheet import.

## Read next

1. [Surfaces](/design/surfaces) — which surface you're building for, and the
   rules specific to each.
2. [Principles & best practices](/design/principles) — the rules that keep
   Silo's UI consistent. Read once before building anything.
3. [Typography](/design/typography) — every text role, so you never invent a
   font size.
4. [Building modals](/guide/building-modals) — the guided walkthrough with
   full recipes.
