import { useEffect, useState, type ComponentType } from "react";
import * as Phosphor from "@phosphor-icons/react";
import type { IconProps } from "@phosphor-icons/react";
import type {
  Activity,
  ExtensionContext,
  MenuContext,
  PhosphorIconName,
  ToolbarItemContext,
  WorkspaceSectionProps,
} from "@silo-code/sdk";

// ─── Styles ──────────────────────────────────────────────────────────────────

const STYLE_ID = "silo-decoration-demo-styles";
const STYLES = `
.deco-panel {
  padding: 12px;
  font-family: var(--silo-font-ui);
  font-size: calc(1em - 1px);
  color: var(--silo-color-text);
}
.deco-title {
  font-weight: 600;
  color: var(--silo-color-text-hi);
  margin-bottom: 12px;
  font-size: 1em;
}
.deco-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px solid var(--silo-color-border, rgba(128,128,128,0.15));
}
.deco-row:last-child {
  border-bottom: none;
}
.deco-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.deco-label-name {
  font-weight: 500;
  color: var(--silo-color-text-hi);
}
.deco-label-desc {
  font-size: calc(1em - 1.5px);
  color: var(--silo-color-text-lo);
}
.deco-toggle {
  position: relative;
  width: 32px;
  height: 18px;
  flex-shrink: 0;
}
.deco-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}
.deco-toggle-track {
  position: absolute;
  inset: 0;
  border-radius: 9px;
  background: rgba(128,128,128,0.25);
  cursor: pointer;
  transition: background 150ms ease;
}
.deco-toggle input:checked + .deco-toggle-track {
  background: #3b82f6;
}
.deco-toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  transition: transform 150ms ease;
  pointer-events: none;
}
.deco-toggle input:checked ~ .deco-toggle-thumb {
  transform: translateX(14px);
}
.deco-select {
  flex-shrink: 0;
  max-width: 140px;
  padding: 3px 6px;
  border-radius: 4px;
  border: 1px solid var(--silo-color-border, rgba(128,128,128,0.35));
  background: var(--silo-color-bg, transparent);
  color: var(--silo-color-text-hi);
  font-family: var(--silo-font-ui);
  font-size: calc(1em - 1px);
}
.deco-preview {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 4px;
  color: var(--silo-color-text-lo);
}
.deco-section {
  margin-top: 4px;
  padding: 4px 6px;
  border-radius: 3px;
  font-family: var(--silo-font-ui);
  font-size: calc(1em - 1.5px);
  color: var(--silo-color-text-lo);
  background: color-mix(in srgb, #a78bfa 8%, transparent);
  border: 1px solid color-mix(in srgb, #a78bfa 30%, transparent);
}
.deco-hint {
  margin-top: 10px;
  font-size: calc(1em - 1.5px);
  color: var(--silo-color-text-lo);
  line-height: 1.4;
}
.deco-preview svg {
  width: 1em;
  height: 1em;
}
`;

export function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = STYLES;
  document.head.appendChild(el);
}

export function removeStyles(): void {
  document.getElementById(STYLE_ID)?.remove();
}

// ─── Icon sets (Phosphor names — toolbar API takes the name, not a node) ─────

type IconRole = "mark" | "editor" | "terminal" | "pin";

type IconSet = {
  id: string;
  label: string;
  icons: Record<IconRole, PhosphorIconName>;
};

const ICON_SETS: IconSet[] = [
  {
    id: "classic",
    label: "Classic",
    icons: {
      mark: "Flag",
      editor: "Star",
      terminal: "Lightning",
      pin: "PushPin",
    },
  },
  {
    id: "shapes",
    label: "Shapes",
    icons: {
      mark: "Circle",
      editor: "Diamond",
      terminal: "Triangle",
      pin: "Square",
    },
  },
  {
    id: "check",
    label: "Check / X",
    icons: {
      mark: "Check",
      editor: "X",
      terminal: "WarningCircle",
      pin: "Question",
    },
  },
  {
    id: "arrows",
    label: "Arrows",
    icons: {
      mark: "ArrowRight",
      editor: "ArrowUp",
      terminal: "ArrowClockwise",
      pin: "ArrowBendDownRight",
    },
  },
  {
    id: "viewer",
    label: "Viewer",
    icons: {
      mark: "Camera",
      editor: "Cursor",
      terminal: "Globe",
      pin: "Bookmark",
    },
  },
  {
    id: "marks",
    label: "Marks",
    icons: {
      mark: "Bookmark",
      editor: "Heart",
      terminal: "Tag",
      pin: "PushPin",
    },
  },
];

let iconSetId = ICON_SETS[0]!.id;
const listeners = new Set<() => void>();
function notify() {
  for (const l of listeners) l();
}
function currentSet(): IconSet {
  return ICON_SETS.find((s) => s.id === iconSetId) ?? ICON_SETS[0]!;
}
function setIconSetId(id: string) {
  if (iconSetId === id) return;
  iconSetId = id;
  notify();
}

function resolveIcon(name: PhosphorIconName) {
  return (Phosphor as Record<string, unknown>)[name] as
    | ComponentType<IconProps>
    | undefined;
}

/** Local glyph for menus / panel preview (toolbar + tabs take name strings). */
function Glyph({
  role,
  weight = "bold",
}: {
  role: IconRole;
  weight?: IconProps["weight"];
}) {
  const Icon = resolveIcon(currentSet().icons[role]);
  if (!Icon) return null;
  return <Icon weight={weight} size="1em" aria-hidden />;
}
function MarkIcon() {
  return <Glyph role="mark" />;
}

// ─── Toggle ──────────────────────────────────────────────────────────────────

function Toggle({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="deco-toggle">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="deco-toggle-track" />
      <span className="deco-toggle-thumb" />
    </label>
  );
}

function DemoSection({ workspaceId }: WorkspaceSectionProps) {
  return (
    <div className="deco-section">
      Decos section — workspace {workspaceId.slice(0, 8)}
    </div>
  );
}

// Per-panel adornment choices for the demo (module state so provide() can read).
type PanelKey = `editor:${string}` | `terminal:${string}`;
const marked = new Set<PanelKey>();
function panelKey(kind: "editor" | "terminal", id: string): PanelKey {
  return `${kind}:${id}`;
}
function toggleMark(kind: "editor" | "terminal", id: string) {
  const k = panelKey(kind, id);
  if (marked.has(k)) marked.delete(k);
  else marked.add(k);
  notify();
}
function isMarked(kind: "editor" | "terminal", id: string) {
  return marked.has(panelKey(kind, id));
}

const TAB_ACTIVITY_OPTIONS: {
  id: "" | Activity;
  label: string;
}[] = [
  { id: "", label: "None" },
  { id: "working", label: "working — blue rings" },
  { id: "ready", label: "ready — green throb" },
  { id: "warn", label: "warn — amber static" },
  { id: "error", label: "error — red static" },
];

// ─── Main panel ──────────────────────────────────────────────────────────────

export function DemoPanel({ ctx }: { ctx: ExtensionContext }) {
  const [statusOn, setStatusOn] = useState(false);
  const [sectionsOn, setSectionsOn] = useState(false);
  const [badgesOn, setBadgesOn] = useState(false);
  const [tabDecoOn, setTabDecoOn] = useState(false);
  const [tabFilledOn, setTabFilledOn] = useState(false);
  const [tabChipOn, setTabChipOn] = useState(false);
  const [tabActivity, setTabActivity] = useState<"" | Activity>("");
  const [toolbarOn, setToolbarOn] = useState(false);
  const [selectedSet, setSelectedSet] = useState(iconSetId);
  const [, setMarkTick] = useState(0);

  useEffect(() => {
    const bump = () => {
      setMarkTick((t) => t + 1);
      setSelectedSet(iconSetId);
    };
    listeners.add(bump);
    return () => {
      listeners.delete(bump);
    };
  }, []);

  useEffect(() => {
    if (!statusOn) return;
    const d = ctx.workspaces.bindStatus({
      id: "silo.decoration-demo.status",
      provide: () => [
        {
          id: "demo-ok",
          activity: "ready",
          label: "Decos: everything looks good",
        },
        {
          id: "demo-busy",
          activity: "working",
          label: "Decos: task running",
          startedAt: new Date().toISOString(),
        },
      ],
    });
    return () => d.dispose();
  }, [ctx, statusOn]);

  useEffect(() => {
    if (!sectionsOn) return;
    const d = ctx.workspaces.registerSection({
      id: "silo.decoration-demo.section",
      component: DemoSection,
      order: 99,
    });
    return () => d.dispose();
  }, [ctx, sectionsOn]);

  useEffect(() => {
    if (!badgesOn) return;
    const d = ctx.workspaces.bindBadge({
      id: "silo.decoration-demo.badge",
      provide: () => [
        { id: "demo", text: "demo", color: "#60a5fa" },
        { id: "env", text: "dev" },
      ],
    });
    return () => d.dispose();
  }, [ctx, badgesOn]);

  // Stacked tab indicators: mark (when marked) + always-on editor/terminal samples.
  // Filled weight + tinted chip are panel toggles (default off).
  useEffect(() => {
    if (!tabDecoOn) return;
    const icons = currentSet().icons;
    const style = {
      ...(tabFilledOn ? { filled: true as const } : {}),
      ...(tabChipOn ? { chip: true as const } : {}),
    };
    const disposables = [
      ctx.editors.bindIndicator({
        id: "silo.decoration-demo.tab-flag",
        provide: (editorId) =>
          isMarked("editor", editorId)
            ? {
                icon: icons.mark,
                tooltip: "Decos mark",
                color: "warn",
                ...style,
              }
            : null,
      }),
      ctx.terminals.bindIndicator({
        id: "silo.decoration-demo.tab-flag",
        provide: (terminalId) =>
          isMarked("terminal", terminalId)
            ? {
                icon: icons.mark,
                tooltip: "Decos mark",
                color: "warn",
                ...style,
              }
            : null,
      }),
      ctx.editors.bindIndicator({
        id: "silo.decoration-demo.tab-star",
        provide: () => ({
          icon: icons.editor,
          tooltip: "Decos editor sample",
          color: "accent",
          ...style,
        }),
      }),
      ctx.terminals.bindIndicator({
        id: "silo.decoration-demo.tab-bolt",
        provide: () => ({
          icon: icons.terminal,
          tooltip: "Decos terminal sample",
          color: "ok",
          ...style,
        }),
      }),
    ];
    const invalidate = () => {
      ctx.editors.invalidateTabAdornments();
      ctx.terminals.invalidateTabAdornments();
    };
    listeners.add(invalidate);
    invalidate();
    return () => {
      listeners.delete(invalidate);
      for (const d of disposables) d.dispose();
      invalidate();
    };
  }, [ctx, tabDecoOn, selectedSet, tabFilledOn, tabChipOn]);

  // Tab Activity — host owns glyph/color; extension picks kind (ADR 0030).
  useEffect(() => {
    if (!tabActivity) return;
    const contribution = {
      activity: tabActivity,
      tooltip: `Decos activity: ${tabActivity}`,
    };
    const disposables = [
      ctx.editors.bindActivity({
        id: "silo.decoration-demo.tab-activity",
        provide: () => contribution,
      }),
      ctx.terminals.bindActivity({
        id: "silo.decoration-demo.tab-activity",
        provide: () => contribution,
      }),
    ];
    const invalidate = () => {
      ctx.editors.invalidateTabAdornments();
      ctx.terminals.invalidateTabAdornments();
    };
    invalidate();
    return () => {
      for (const d of disposables) d.dispose();
      invalidate();
    };
  }, [ctx, tabActivity]);

  // Toolbar toggles + context menus (independent contributions).
  // Re-register when the icon set changes — toolbar `icon` is a Phosphor name.
  useEffect(() => {
    if (!toolbarOn) return;

    const icons = currentSet().icons;

    const runToggle = (...args: unknown[]) => {
      const t = args[0] as
        | ToolbarItemContext["editor"]
        | ToolbarItemContext["terminal"]
        | MenuContext["editor/tab"]
        | MenuContext["terminal/tab"];
      if ("editorId" in t) toggleMark("editor", t.editorId);
      else if ("terminalId" in t) toggleMark("terminal", t.terminalId);
      ctx.invalidateToolbarItems();
      ctx.editors.invalidateTabAdornments();
      ctx.terminals.invalidateTabAdornments();
    };

    const markMenu = (kind: "editor" | "terminal", id: string) => [
      {
        label: isMarked(kind, id) ? "Clear mark" : "Toggle mark",
        icon: <MarkIcon />,
        checked: isMarked(kind, id),
        run: () => {
          toggleMark(kind, id);
          ctx.invalidateToolbarItems();
          ctx.editors.invalidateTabAdornments();
          ctx.terminals.invalidateTabAdornments();
        },
      },
      { type: "separator" as const },
      {
        label: "Mark (demo)",
        run: () => {
          if (!isMarked(kind, id)) toggleMark(kind, id);
          ctx.invalidateToolbarItems();
          ctx.editors.invalidateTabAdornments();
          ctx.terminals.invalidateTabAdornments();
        },
      },
    ];

    const disposables = [
      ctx.registerCommand({
        id: "silo.decoration-demo.toggleMark",
        label: "Decos: Toggle mark",
        run: runToggle,
      }),
      // Icon-only — Phosphor export name, host paints bold 1em
      ctx.registerToolbarItem({
        id: "silo.decoration-demo.toolbar-icon-editor",
        surface: "editor",
        command: "silo.decoration-demo.toggleMark",
        icon: icons.mark,
        tooltip: "Icon-only mark",
        label: "Decos mark",
        checked: (_k, t) => isMarked("editor", t.editorId),
        order: 10,
      }),
      // Text-only
      ctx.registerToolbarItem({
        id: "silo.decoration-demo.toolbar-text-editor",
        surface: "editor",
        command: "silo.decoration-demo.toggleMark",
        title: "Mark",
        tooltip: "Text-only mark",
        checked: (_k, t) => isMarked("editor", t.editorId),
        order: 20,
      }),
      // Icon + text
      ctx.registerToolbarItem({
        id: "silo.decoration-demo.toolbar-both-editor",
        surface: "editor",
        command: "silo.decoration-demo.toggleMark",
        icon: icons.pin,
        title: "Pin",
        tooltip: "Icon + text mark",
        checked: (_k, t) => isMarked("editor", t.editorId),
        order: 30,
      }),
      ctx.registerToolbarItem({
        type: "separator",
        id: "silo.decoration-demo.toolbar-sep-editor",
        surface: "editor",
        order: 35,
      }),
      // Dropdown
      ctx.registerToolbarItem({
        id: "silo.decoration-demo.toolbar-menu-editor",
        surface: "editor",
        icon: icons.mark,
        title: "Actions",
        tooltip: "Dropdown menu",
        order: 40,
        menu: (t) => markMenu("editor", t.editorId),
      }),
      // Terminal: icon-only + dropdown
      ctx.registerToolbarItem({
        id: "silo.decoration-demo.toolbar-icon-terminal",
        surface: "terminal",
        command: "silo.decoration-demo.toggleMark",
        icon: icons.mark,
        tooltip: "Icon-only mark",
        label: "Decos mark",
        checked: (_k, t) => isMarked("terminal", t.terminalId),
        order: 10,
      }),
      ctx.registerToolbarItem({
        id: "silo.decoration-demo.toolbar-menu-terminal",
        surface: "terminal",
        title: "Actions",
        tooltip: "Dropdown menu",
        order: 20,
        menu: (t) => markMenu("terminal", t.terminalId),
      }),
      ctx.registerContextMenuItem({
        surface: "editor/tab",
        command: "silo.decoration-demo.toggleMark",
        label: "Decos: Toggle mark",
        icon: <MarkIcon />,
        checked: (_k, t) => isMarked("editor", t.editorId),
      }),
      ctx.registerContextMenuItem({
        surface: "terminal/tab",
        command: "silo.decoration-demo.toggleMark",
        label: "Decos: Toggle mark",
        icon: <MarkIcon />,
        checked: (_k, t) => isMarked("terminal", t.terminalId),
      }),
    ];

    const onChange = () => ctx.invalidateToolbarItems();
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
      for (const d of disposables) d.dispose();
      ctx.invalidateToolbarItems();
    };
  }, [ctx, toolbarOn, selectedSet]);

  return (
    <div className="deco-panel">
      <div className="deco-title">Decorations</div>

      <div className="deco-row">
        <div className="deco-label">
          <span className="deco-label-name">Icon set</span>
          <span className="deco-label-desc">
            Phosphor names — toolbar bold, tabs fill
            <span className="deco-preview" aria-hidden>
              <Glyph role="mark" weight="fill" />
              <Glyph role="editor" weight="fill" />
              <Glyph role="terminal" weight="fill" />
              <Glyph role="pin" />
            </span>
          </span>
        </div>
        <select
          className="deco-select"
          value={selectedSet}
          aria-label="Icon set"
          onChange={(e) => {
            setIconSetId(e.target.value);
            ctx.editors.invalidateTabAdornments();
            ctx.terminals.invalidateTabAdornments();
            ctx.invalidateToolbarItems();
          }}
        >
          {ICON_SETS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="deco-row">
        <div className="deco-label">
          <span className="deco-label-name">Badges</span>
          <span className="deco-label-desc">Next to the workspace name</span>
        </div>
        <Toggle id="badges" checked={badgesOn} onChange={setBadgesOn} />
      </div>

      <div className="deco-row">
        <div className="deco-label">
          <span className="deco-label-name">Status rows</span>
          <span className="deco-label-desc">Status rows below the path</span>
        </div>
        <Toggle id="status" checked={statusOn} onChange={setStatusOn} />
      </div>

      <div className="deco-row">
        <div className="deco-label">
          <span className="deco-label-name">Sections</span>
          <span className="deco-label-desc">
            Custom content below status rows
          </span>
        </div>
        <Toggle id="sections" checked={sectionsOn} onChange={setSectionsOn} />
      </div>

      <div className="deco-row">
        <div className="deco-label">
          <span className="deco-label-name">Tab decorations</span>
          <span className="deco-label-desc">
            Stacked icons on editor/terminal tabs
          </span>
        </div>
        <Toggle id="tabdeco" checked={tabDecoOn} onChange={setTabDecoOn} />
      </div>

      <div className="deco-row">
        <div className="deco-label">
          <span className="deco-label-name">Tab icon filled</span>
          <span className="deco-label-desc">
            filled: true on tab decorations (default is regular)
          </span>
        </div>
        <Toggle
          id="tabfilled"
          checked={tabFilledOn}
          onChange={setTabFilledOn}
        />
      </div>

      <div className="deco-row">
        <div className="deco-label">
          <span className="deco-label-name">Tab icon chip</span>
          <span className="deco-label-desc">
            chip: true — tinted background behind the glyph
          </span>
        </div>
        <Toggle id="tabchip" checked={tabChipOn} onChange={setTabChipOn} />
      </div>

      <div className="deco-row">
        <div className="deco-label">
          <span className="deco-label-name">Tab activity</span>
          <span className="deco-label-desc">
            host-owned activity on every editor/terminal tab
          </span>
        </div>
        <select
          className="deco-select"
          value={tabActivity}
          aria-label="Tab activity"
          onChange={(e) => setTabActivity(e.target.value as "" | Activity)}
        >
          {TAB_ACTIVITY_OPTIONS.map((o) => (
            <option key={o.id || "none"} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="deco-row">
        <div className="deco-label">
          <span className="deco-label-name">Toolbar + tab menus</span>
          <span className="deco-label-desc">
            Icon / text / icon+text / sep / dropdown (breadcrumbs on)
          </span>
        </div>
        <Toggle id="toolbar" checked={toolbarOn} onChange={setToolbarOn} />
      </div>

      <p className="deco-hint">
        Turn on Tab decorations (optionally Filled / Chip), pick a Tab activity,
        and/or Toolbar; keep editor/terminal breadcrumbs enabled; open a few
        tabs. Mark a tab from the toolbar to see the mark icon with the same
        filled/chip settings.
      </p>
    </div>
  );
}
