import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import {
  topSlot,
  bottomSlot,
  usePanelsForSlot,
  useSideTabDrag,
} from "./side-column-helpers";
import { PanelPane } from "./PanelPane";
import "./SideColumn.css";

function EmptyColumn({ location }: { location: "left" | "right" }) {
  const activeDrag = useSideTabDrag();

  const eligible =
    activeDrag !== null &&
    activeDrag.sourceSlot !== location &&
    activeDrag.sourceSlot !== `${location}-bottom`;

  const over = eligible && activeDrag?.hoverSlot === topSlot(location);

  return (
    <div
      className={`side-empty-column${over ? " over" : ""}`}
      data-slot={topSlot(location)}
    />
  );
}

export function SideColumn({ location }: { location: "left" | "right" }) {
  const topPanels = usePanelsForSlot(topSlot(location));
  const bottomPanels = usePanelsForSlot(bottomSlot(location));
  const hasSplit = bottomPanels.length > 0;

  if (topPanels.length === 0 && !hasSplit)
    return <EmptyColumn location={location} />;

  if (!hasSplit) {
    return (
      <PanelPane
        panels={topPanels}
        slot={topSlot(location)}
        location={location}
        canSplit
      />
    );
  }

  return (
    <PanelGroup
      direction="vertical"
      autoSaveId={`app:side-split-${location}`}
      className="side-column"
    >
      <Panel defaultSize={55} minSize={20} className="side-panel-segment">
        <PanelPane
          panels={topPanels}
          slot={topSlot(location)}
          location={location}
          canSplit={false}
        />
      </Panel>
      <PanelResizeHandle
        className="side-resize-handle"
        onDragging={(d) => document.body.classList.toggle("panel-resizing", d)}
      />
      <Panel defaultSize={45} minSize={15} className="side-panel-segment">
        <PanelPane
          panels={bottomPanels}
          slot={bottomSlot(location)}
          location={location}
          canSplit={false}
        />
      </Panel>
    </PanelGroup>
  );
}
