/**
 * The chat transcript's right-click menu. Pure builder so enablement is
 * unit-tested; the panel supplies clipboard / open / select-all actions.
 *
 * When the click lands on a detected URL or file path, Open / Copy link
 * sit above Copy / Select All — the same order as the terminal (ADR 0027).
 */

import type { MenuEntry } from "@silo-code/sdk";
import type { ChatLinkKind } from "./link-match";
import { linkMenuLabels } from "./link-policy";

export interface ChatSelectionMenuInput {
  readonly selection: string;
  readonly link?: { readonly kind: ChatLinkKind; readonly text: string };
  readonly cmdKey: string;
  readonly onCopy: () => void;
  readonly onSelectAll: () => void;
  readonly onOpenLink?: () => void;
  readonly onCopyLink?: () => void;
}

export function buildChatSelectionMenu(
  input: ChatSelectionMenuInput,
): MenuEntry[] {
  const generic: MenuEntry[] = [
    {
      label: "Copy",
      accelerator: `${input.cmdKey}C`,
      disabled: input.selection.length === 0,
      run: input.onCopy,
    },
    {
      label: "Select All",
      accelerator: `${input.cmdKey}A`,
      run: input.onSelectAll,
    },
  ];
  if (!input.link || !input.onOpenLink || !input.onCopyLink) return generic;
  const labels = linkMenuLabels(input.link.kind);
  return [
    { label: labels.open, run: input.onOpenLink },
    { label: labels.copy, run: input.onCopyLink },
    { type: "separator" },
    ...generic,
  ];
}
