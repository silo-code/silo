import type { DropZone } from "./side-dock-drop";

export interface SideTabDrag {
  panelId: string;
  sourceSlot: string;
  /** Slot currently under the pointer (updated during pointer move) */
  hoverSlot?: string;
  /** Which zone of the hovered pane: its tab bar, or one of the four edges. */
  hoverZone?: DropZone;
}

let current: SideTabDrag | null = null;
const listeners = new Set<() => void>();

export const sideTabDrag = {
  get(): SideTabDrag | null {
    return current;
  },
  set(drag: SideTabDrag | null) {
    current = drag;
    listeners.forEach((fn) => fn());
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
