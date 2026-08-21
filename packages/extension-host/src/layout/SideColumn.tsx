import { useMemo, useRef } from "react";
import { useSnapshot } from "valtio";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import {
  usePanelsForSlot,
  useRegistryTick,
  useSideTabDrag,
  sidePanelVisibilityItems,
} from "./side-column-helpers";
import { openMenu } from "../extension-host/menu-controller";
import { store, setSideDockSizes } from "../state/store";
import {
  childAnchors,
  firstPaneId,
  isPane,
  paneIds,
  resolvePaneId,
  retainPanes,
  type SideDockNode,
  type SideDockTrees,
} from "../state/side-dock-tree";
import { sidePanelRegistry } from "../extension-host/side-panels";
import { PanelPane } from "./PanelPane";
import "./SideColumn.css";

function EmptyColumn({
  location,
  paneId,
}: {
  location: "left" | "right";
  /** The dock's first pane — the one a drop here lands in. Not the literal
   * "left"/"right": a split can put a minted pane in front of it. */
  paneId: string;
}) {
  const activeDrag = useSideTabDrag();
  const over = activeDrag !== null && activeDrag.hoverSlot === paneId;

  return (
    <div
      className={`side-empty-column${over ? " over" : ""}`}
      data-slot={paneId}
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
}: {
  paneId: string;
  location: "left" | "right";
}) {
  const panels = usePanelsForSlot(paneId);
  return <PanelPane panels={panels} slot={paneId} location={location} />;
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
}: {
  node: SideDockNode;
  location: "left" | "right";
  path: readonly number[];
}) {
  // `onLayout` also fires for mount and for the library's own re-validation
  // against new constraints, and recording those would let a stint at a narrow
  // window permanently re-proportion the dock. Only a drag is a real resize —
  // the same guard AppShell puts on the main columns.
  const dragging = useRef(false);

  if (isPane(node)) {
    return <PaneLeaf paneId={node.id} location={location} />;
  }

  const isRow = node.direction === "row";
  // What the split's children look like *on screen*. A dock hides the panes
  // whose panels are all hidden, so the rendered tree can be a subset of the
  // stored one — the anchors let the write refuse a split it isn't aimed at.
  const anchors = childAnchors(node);

  return (
    <PanelGroup
      direction={isRow ? "horizontal" : "vertical"}
      className="side-column"
      onLayout={(sizes) => {
        if (dragging.current) setSideDockSizes(location, path, anchors, sizes);
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
            <TreeNode node={child} location={location} path={[...path, i]} />
          </Panel>
        );
        if (i === 0) return [panel];
        return [
          <PanelResizeHandle
            key={`handle:${key}`}
            className="side-resize-handle"
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
  const trees = snap.sideDockTrees as SideDockTrees;
  const tree = trees[location];

  // Which panes have something to show. A panel counts toward the pane it
  // *resolves* to, so an override this build can't render keeps its panel in
  // the dock it registered with rather than nowhere (see resolveSidePanelSlot).
  const occupied = useMemo(() => {
    const ids = new Set<string>();
    for (const p of sidePanelRegistry.list()) {
      if (snap.sidePanelVisibility[p.id] === false) continue;
      ids.add(resolvePaneId(trees, snap.sidePanelLocations[p.id], p.location));
    }
    return ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, trees, snap.sidePanelVisibility, snap.sidePanelLocations]);

  // What's on screen is the stored arrangement minus the panes with nothing
  // visible in them. Filtering here rather than pruning the stored tree is what
  // makes hiding a panel collapse its segment and un-hiding bring it back at
  // the same size — the behavior the fixed Top/Bottom slots had for free.
  const visible = useMemo(
    () => retainPanes(tree, (id) => occupied.has(id)),
    [tree, occupied],
  );

  if (visible === null)
    return <EmptyColumn location={location} paneId={firstPaneId(tree)} />;

  return (
    <TreeNode
      // Remount when the *shape* changes so the panels adopt the new sizes;
      // a plain re-render would keep the library's current layout, since
      // `defaultSize` is only read on mount. Sizes alone don't change the key.
      key={paneIds(visible).join("|")}
      node={visible}
      location={location}
      path={EMPTY_PATH}
    />
  );
}

const EMPTY_PATH: readonly number[] = [];
