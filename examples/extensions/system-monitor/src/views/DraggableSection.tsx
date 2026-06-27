import { useRef, useState } from "react";
import { GripIcon } from "../icons";
import { Toggle } from "./Toggle";
import type { PanelId } from "../store";

export interface DraggableItem {
  id: PanelId;
  label: string;
  hint: string;
  enabled: boolean;
}

export function DraggableSection({
  title,
  items,
  onToggle,
  onReorder,
}: {
  title: string;
  items: DraggableItem[];
  onToggle: (id: PanelId, next: boolean) => void;
  onReorder: (from: number, to: number) => void;
}) {
  const dragIndex = useRef<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);

  function onDragStart(i: number) {
    dragIndex.current = i;
  }

  function onDragOver(e: React.DragEvent, i: number) {
    e.preventDefault();
    if (
      dragIndex.current !== null &&
      dragIndex.current !== i &&
      dropTarget !== i
    ) {
      setDropTarget(i);
    }
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
        {items.map((item, i) => (
          <div
            key={item.id}
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
              <span className="es-label">{item.label}</span>
              <span className="es-hint">{item.hint}</span>
            </div>
            <div className="es-control sms-panel-controls">
              <Toggle
                label={`Show ${item.label}`}
                checked={item.enabled}
                onChange={(next) => onToggle(item.id, next)}
              />
              <span className="sms-grip" title="Drag to reorder" aria-hidden>
                <GripIcon />
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
