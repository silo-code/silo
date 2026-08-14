# UI Terminology

This document defines the high-level terminology for the Silo UI components. Use these terms when discussing layout changes or referring to specific areas of the application.

## 1. Root Containers

- **Shell**: The top-level layout container that orchestrates the overall grid (left column, center, right column, status bar).
- **Titlebar**: The interactive region at the very top used for window dragging and window controls.
- **StatusBar**: The horizontal bar at the very bottom for global status items and quick toggles.

## 2. Layout Columns

- **SideDock (Left/Right)**: The collapsible vertical containers on either side of the center area.
- **CenterDock**: The primary high-focus area in the middle of the app. It is "workspace-aware" and usually hosts the `WorkspaceDock`.
- **Slot**: A specific region within a `SideColumn`. A column can be split into a **Top Slot** and a **Bottom Slot**.

## 3. Panel & Docking Concepts

- **Dock**: A container that manages flexible layout and tab grouping (e.g., `WorkspaceDock` uses the `dockview` library).
- **Group**: A collection of panels sharing a single tab bar within a Dock. Groups can be split horizontally or vertically.
- **Panel**: The fundamental unit of UI content (e.g., a Terminal, a File Explorer, or an Editor). There are `Side Panels` that live in the `SideDock` and `Content or File Panels` that live in the `CenterDock`.
- **Navigator**: The side panel you navigate the app from (`core.navigator`). It is a _container_: every registered **View** is listed by name at the top of the panel (the **View List**), and the **Active View** renders below a **View Header** that names it and holds its actions — toolbar contributions on the `"navigator"` surface. The View List is hidden when only one View is registered. See [RFC 0023](./proposals/0023-workspace-panel-views.md) and [ADR 0038](./decisions/0038-navigator-view-list.md).
- **Active View**: The View currently rendered in the Navigator — a persisted, global user choice, not the focus/activation sense "active" carries for workspaces, docks, and panels.
- **View List**: The rows at the top of the Navigator, one per registered View. Deliberately not highlighted for the Active View — the View Header below is what names it.
- **View Header**: The bar under the View List naming the Active View and hosting its toolbar actions.
- **View**: One projection inside the Navigator — "where can I go", rendered a particular way. The **Workspaces** view (the workspace list, contributed by `core.workspaces`) is the default one; extensions add their own via `ctx.registerNavigatorView`. A View is _not_ a Panel: adding another way to navigate means adding a View, not a second Side Panel.
- **Tab**: The UI handle used to switch between Panels within a Group.

## 4. Interaction States

- **Collapsed / Expanded**: Refers to the visibility of a `SideColumn`.
- **Split**: The act of dividing a Slot or Group into two or more sections.
