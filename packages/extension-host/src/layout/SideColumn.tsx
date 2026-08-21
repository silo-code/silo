import { useMemo, useRef } from "react";
import { useSnapshot } from "valtio";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import {
  topSlot,
  usePanelsForSlot,
  useRegistryTick,
  useSideTabDrag,
  sidePanelVisibilityItems,
} from "./side-column-helpers";
import { openMenu } from "../extension-host/menu-controller";
import { store, setSideDockSizes } from "../state/store";
import {
  isPane,
  paneIds,
  retainPanes,
  type SideDockNode,
} from "../state/side-dock-tree";
import { sidePanelRegistry } from "../extension-host/side-panels";
import { resolveSidePanelSlot } from "./side-panel-slots";
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
      data-location={location}
      onContextMenu={(e) => {
        // The only entry point back when every panel is hidden — the tab bar
        // that normally hosts this menu isn't rendered for an empty column.
        e.preventDefault();
        void openMenu({
          items: sidePanelVisibilityItems(),
          at: { x: e.clientX, y: e.clientY },
        });
      }}
    />
  );
}

/** One leaf of the tree: the pane's tab bar and body. */
function PaneLeaf({
  paneId,
  location,
  canSplit,
}: {
  paneId: string;
  location: "left" | "right";
  canSplit: boolean;
}) {
  const panels = usePanelsForSlot(paneId);
  return (
    <PanelPane
      panels={panels}
      slot={paneId}
      location={location}
      canSplit={canSplit}
    />
  );
}

/**
 * Render a subtree.
 *
 * `path` is the index route from the dock's root to this node — how a resize
 * writes back, since a split has no identity of its own (only its panes do).
 */
function TreeNode({
  node,
  location,
  path,
  onlyPane,
}: {
  node: SideDockNode;
  location: "left" | "right";
  path: readonly number[];
  /** True when this dock renders exactly one pane — the only shape the
   * drop-on-the-bottom-half split gesture still applies to. */
  onlyPane: boolean;
}) {
  // `onLayout` also fires for mount and for the library's own re-validation
  // against new constraints, and recording those would let a stint at a narrow
  // window permanently re-proportion the dock. Only a drag is a real resize —
  // the same guard AppShell puts on the main columns.
  const dragging = useRef(false);

  if (isPane(node)) {
    return (
      <PaneLeaf paneId={node.id} location={location} canSplit={onlyPane} />
    );
  }

  const isRow = node.direction === "row";

  return (
    <PanelGroup
      direction={isRow ? "horizontal" : "vertical"}
      className="side-column"
      onLayout={(sizes) => {
        if (dragging.current) setSideDockSizes(location, path, sizes);
      }}
    >
      {node.children.flatMap((child, i) => {
        const key = isPane(child) ? `pane:${child.id}` : `split:${i}`;
        const panel = (
          <Panel
            key={key}
            defaultSize={node.sizes[i]}
            minSize={isRow ? 20 : 15}
            className="side-panel-segment"
          >
            <TreeNode
              node={child}
              location={location}
              path={[...path, i]}
              onlyPane={false}
            />
          </Panel>
        );
        if (i === 0) return [panel];
        return [
          <PanelResizeHandle
            key={`handle:${key}`}
            className={`side-resize-handle${isRow ? " side-resize-handle--row" : ""}`}
            onDragging={(d) => {
              dragging.current = d;
              document.body.classList.toggle("panel-resizing", d);
            }}
          />,
          panel,
        ];
      })}
    </PanelGroup>
  );
}

export function SideColumn({ location }: { location: "left" | "right" }) {
  const snap = useSnapshot(store);
  const tick = useRegistryTick();
  const tree = snap.sideDockTrees[location] as SideDockNode;

  // Which panes have something to show. A panel counts toward the pane it
  // *resolves* to, so an override this build can't render keeps its panel in
  // the dock it registered with rather than nowhere (see resolveSidePanelSlot).
  const occupied = useMemo(() => {
    const ids = new Set<string>();
    for (const p of sidePanelRegistry.list()) {
      if (snap.sidePanelVisibility[p.id] === false) continue;
      ids.add(resolveSidePanelSlot(snap.sidePanelLocations[p.id], p.location));
    }
    return ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, snap.sidePanelVisibility, snap.sidePanelLocations]);

  // What's on screen is the stored arrangement minus the panes with nothing
  // visible in them. Filtering here rather than pruning the stored tree is what
  // makes hiding a panel collapse its segment and un-hiding bring it back at
  // the same size — the behavior the fixed Top/Bottom slots had for free.
  const visible = useMemo(
    () => retainPanes(tree, (id) => occupied.has(id)),
    [tree, occupied],
  );

  if (visible === null) return <EmptyColumn location={location} />;

  return (
    <TreeNode
      // Remount when the *shape* changes so the panels adopt the new sizes;
      // a plain re-render would keep the library's current layout, since
      // `defaultSize` is only read on mount. Sizes alone don't change the key.
      key={paneIds(visible).join("|")}
      node={visible}
      location={location}
      path={EMPTY_PATH}
      onlyPane={isPane(visible)}
    />
  );
}

const EMPTY_PATH: readonly number[] = [];
