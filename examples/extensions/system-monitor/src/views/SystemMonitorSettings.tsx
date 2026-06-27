import { useStore } from "../hooks";
import { sysmonStore } from "../store";
import type { PanelId, Settings } from "../store";
import { METRIC_REGISTRY } from "../registry";
import { DraggableSection } from "./DraggableSection";
import type { DraggableItem } from "./DraggableSection";

function reorder<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function toItems(
  entries: { id: PanelId; enabled: boolean }[],
  hintKey: "panelHint" | "sbHint",
): DraggableItem[] {
  return entries.map((e) => {
    const m = METRIC_REGISTRY.find((r) => r.id === e.id);
    return {
      id: e.id,
      label: m?.label ?? e.id,
      hint: m?.[hintKey] ?? "",
      enabled: e.enabled,
    };
  });
}

// Used both as the registered settings page and inline in the panel overlay.
// When onClose is provided the component renders in inline mode (compact sm-* layout).
// When omitted it renders in page mode (host es-* scaffold).
export function SystemMonitorSettings({ onClose }: { onClose?: () => void }) {
  const store = useStore();
  const { settings } = store;

  function toggle(
    key: keyof Pick<Settings, "panels" | "statusBar">,
    id: PanelId,
    next: boolean,
  ) {
    sysmonStore.updateSettings({
      ...settings,
      [key]: settings[key].map((p) =>
        p.id === id ? { ...p, enabled: next } : p,
      ),
    });
  }

  function reorderSection(
    key: keyof Pick<Settings, "panels" | "statusBar">,
    from: number,
    to: number,
  ) {
    sysmonStore.updateSettings({
      ...settings,
      [key]: reorder(settings[key], from, to),
    });
  }

  const content = (
    <>
      <DraggableSection
        title="Side Panels"
        items={toItems(settings.panels, "panelHint")}
        onToggle={(id, next) => toggle("panels", id, next)}
        onReorder={(from, to) => reorderSection("panels", from, to)}
      />
      <DraggableSection
        title="Status Bar"
        items={toItems(settings.statusBar, "sbHint")}
        onToggle={(id, next) => toggle("statusBar", id, next)}
        onReorder={(from, to) => reorderSection("statusBar", from, to)}
      />
    </>
  );

  const layout = onClose
    ? { outer: "sm-settings-overlay", scroll: "sm-settings-scroll" }
    : { outer: "es-page", scroll: "es-scroll" };

  return (
    <div className={layout.outer}>
      {onClose ? (
        <div className="sm-settings-header">
          <button className="sm-back-btn" onClick={onClose}>
            ← Back
          </button>
        </div>
      ) : (
        <div className="es-header">
          <h2>System Monitor</h2>
        </div>
      )}
      <div className={layout.scroll}>{content}</div>
    </div>
  );
}
