/**
 * The rule for a Shift-held file drop on the chat panel: which paths it
 * stages as attachments, and nothing at all for the drops that belong to
 * dockview.
 *
 * Pure so the accept/reject matrix — the mode, the composer's writability, a
 * drag carrying no paths — is tested without a drop target or a DOM.
 */

import { DND_MIME, type DndItem, type DndMode } from "@silo-code/sdk";

export interface FileDropInput {
  mode: DndMode;
  items: readonly DndItem[];
  /** Whether the composer currently accepts input. */
  inputEnabled: boolean;
}

/**
 * The absolute paths a drop should stage, or `null` when the panel should let
 * the drop fall through — plain copy-mode drops open an editor pane, and a
 * read-only or lost session has nowhere to stage anything.
 */
export function fileDropPaths(input: FileDropInput): string[] | null {
  if (!input.inputEnabled || input.mode !== "paste") return null;
  const paths = input.items
    .filter((i) => i.mime === DND_MIME.filePath)
    .map((i) => i.value);
  return paths.length ? paths : null;
}
