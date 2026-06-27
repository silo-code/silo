import { useEffect, useRef, useState } from "react";
import type { PanelEntry } from "./store";
import { sysmonStore } from "./store";

function useStore() {
  const [, tick] = useState(0);
  useEffect(() => sysmonStore.subscribe(() => tick((n) => n + 1)), []);
  return sysmonStore;
}

// ─── Shared components ────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <label className="es-switch">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
      <span className="es-switch-track" />
    </label>
  );
}

function GripIcon() {
  return (
    <svg
      width="12"
      height="14"
      viewBox="0 0 12 14"
      fill="currentColor"
      aria-hidden
    >
      <circle cx="4" cy="2.5" r="1.1" />
      <circle cx="8" cy="2.5" r="1.1" />
      <circle cx="4" cy="7" r="1.1" />
      <circle cx="8" cy="7" r="1.1" />
      <circle cx="4" cy="11.5" r="1.1" />
      <circle cx="8" cy="11.5" r="1.1" />
    </svg>
  );
}

// ─── Draggable section ────────────────────────────────────────────────────────

const ITEM_META: Record<
  PanelEntry["id"],
  { label: string; panelHint: string; sbHint: string }
> = {
  cpu: {
    label: "CPU",
    panelHint: "Live bar chart of user and system CPU usage.",
    sbHint: "Show CPU percentage in the status bar.",
  },
  memory: {
    label: "Memory",
    panelHint: "Donut chart with app, wired, cache, and free segments.",
    sbHint: "Show memory percentage in the status bar.",
  },
};

function DraggableSection({
  title,
  items,
  hintKey,
  onToggle,
  onReorder,
}: {
  title: string;
  items: PanelEntry[];
  hintKey: "panelHint" | "sbHint";
  onToggle: (id: PanelEntry["id"], next: boolean) => void;
  onReorder: (from: number, to: number) => void;
}) {
  const dragIndex = useRef<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);

  function onDragStart(i: number) {
    dragIndex.current = i;
  }

  function onDragOver(e: React.DragEvent, i: number) {
    e.preventDefault();
    if (dragIndex.current !== null && dragIndex.current !== i) setDropTarget(i);
  }

  function onDrop(targetIndex: number) {
    const from = dragIndex.current;
    if (from !== null && from !== targetIndex) onReorder(from, targetIndex);
    reset();
  }

  function reset() {
    dragIndex.current = null;
    setDropTarget(null);
  }

  return (
    <section className="es-section">
      <h3 className="es-section-title">{title}</h3>
      <div className="es-rows" onDragLeave={() => setDropTarget(null)}>
        {items.map((p, i) => {
          const meta = ITEM_META[p.id];
          return (
            <div
              key={p.id}
              className={[
                "es-row sms-draggable-row",
                dragIndex.current === i ? "sms-dragging" : "",
                dropTarget === i ? "sms-drop-target" : "",
              ].join(" ")}
              draggable
              onDragStart={() => onDragStart(i)}
              onDragOver={(e) => onDragOver(e, i)}
              onDrop={() => onDrop(i)}
              onDragEnd={reset}
            >
              <div className="es-row-text">
                <span className="es-label">{meta.label}</span>
                <span className="es-hint">{meta[hintKey]}</span>
              </div>
              <div className="es-control sms-panel-controls">
                <Toggle
                  label={`Show ${meta.label}`}
                  checked={p.enabled}
                  onChange={(next) => onToggle(p.id, next)}
                />
                <span className="sms-grip" title="Drag to reorder" aria-hidden>
                  <GripIcon />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function SystemMonitorSettingsPage() {
  const store = useStore();
  const { settings } = store;

  function reorder(list: PanelEntry[], from: number, to: number): PanelEntry[] {
    const next = [...list];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  }

  function togglePanel(id: PanelEntry["id"], next: boolean) {
    sysmonStore.updateSettings({
      ...settings,
      panels: settings.panels.map((p) =>
        p.id === id ? { ...p, enabled: next } : p,
      ),
    });
  }

  function toggleSb(id: PanelEntry["id"], next: boolean) {
    sysmonStore.updateSettings({
      ...settings,
      statusBar: settings.statusBar.map((p) =>
        p.id === id ? { ...p, enabled: next } : p,
      ),
    });
  }

  return (
    <div className="es-page">
      <div className="es-header">
        <h2>System Monitor</h2>
      </div>
      <div className="es-scroll">
        <DraggableSection
          title="Side Panels"
          items={settings.panels}
          hintKey="panelHint"
          onToggle={togglePanel}
          onReorder={(from, to) =>
            sysmonStore.updateSettings({
              ...settings,
              panels: reorder(settings.panels, from, to),
            })
          }
        />
        <DraggableSection
          title="Status Bar"
          items={settings.statusBar}
          hintKey="sbHint"
          onToggle={toggleSb}
          onReorder={(from, to) =>
            sysmonStore.updateSettings({
              ...settings,
              statusBar: reorder(settings.statusBar, from, to),
            })
          }
        />
      </div>
    </div>
  );
}
