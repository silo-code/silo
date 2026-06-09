import type { MenuEntry } from "@silo-code/sdk";

// The Markdown preview's right-click menu. Pure builder (no DOM / clipboard) so
// the enablement rules are unit-testable; the component supplies the actions.

export interface PreviewMenuActions {
  /** The currently selected text (drives whether Copy is enabled). */
  selection: string;
  /** Copy the current selection to the clipboard. */
  onCopy: () => void;
  /** Select the whole rendered document. */
  onSelectAll: () => void;
}

/**
 * Build the preview context-menu entries. Copy is enabled only when there's a
 * selection; Cut and Paste are always disabled — the preview is read-only, but
 * they stay present so the menu reads like the familiar clipboard trio.
 */
export function buildPreviewMenuItems({
  selection,
  onCopy,
  onSelectAll,
}: PreviewMenuActions): MenuEntry[] {
  return [
    { label: "Cut", accelerator: "⌘X", disabled: true },
    {
      label: "Copy",
      accelerator: "⌘C",
      disabled: selection.length === 0,
      run: onCopy,
    },
    { label: "Paste", accelerator: "⌘V", disabled: true },
    { type: "separator" },
    { label: "Select All", accelerator: "⌘A", run: onSelectAll },
  ];
}
