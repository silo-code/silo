import type { WorkspaceInternal } from "./types";

// Panel-id renames. A workspace record keys most of its panel state by side
// panel id, so renaming a shipped panel would silently reset that panel's
// placement, visibility, scroll and per-panel storage for anyone who had
// customized it. Each rename below rewrites those keys once, on load.
//
// Idempotent: the old key is gone afterwards, so re-running is a no-op, and a
// record already using the new id is untouched. If the new id is *also*
// present (someone downgraded, then upgraded again) the newer value wins —
// it's the one the user last interacted with.

/** `[from, to]` pairs, oldest first. */
const PANEL_ID_RENAMES: readonly (readonly [string, string])[] = [
  // 0.42: the Workspaces panel became the Navigator — a container whose views
  // include the workspace list (RFC 0023).
  ["workspaces", "navigator"],
];

function renameKey<T>(
  bag: Record<string, T> | undefined,
  from: string,
  to: string,
): Record<string, T> | undefined {
  if (!bag || !(from in bag)) return bag;
  const { [from]: moved, ...rest } = bag;
  // A pre-existing value under the new id is newer; don't clobber it.
  return to in rest ? rest : { ...rest, [to]: moved };
}

function renameValues(
  bag: Record<string, string> | undefined,
  from: string,
  to: string,
): Record<string, string> | undefined {
  if (!bag) return bag;
  let changed = false;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(bag)) {
    if (v === from) {
      out[k] = to;
      changed = true;
    } else {
      out[k] = v;
    }
  }
  return changed ? out : bag;
}

/**
 * Apply every panel-id rename to one workspace record. Returns the same object
 * when nothing changed, so an untouched record isn't needlessly rewritten.
 */
export function migratePanelIds(ws: WorkspaceInternal): WorkspaceInternal {
  let out = ws;
  for (const [from, to] of PANEL_ID_RENAMES) {
    const locations = renameKey(out.sidePanelLocations, from, to);
    const order = renameKey(out.sidePanelOrder, from, to);
    const scroll = renameKey(out.sidePanelScrollPositions, from, to);
    const visibility = renameKey(out.sidePanelVisibility, from, to);
    const extensionState = renameKey(out.extensionState, from, to);
    // activeSidePanelTabs is keyed by *slot* and holds panel ids as values.
    const activeTabs = renameValues(out.activeSidePanelTabs, from, to);
    if (
      locations === out.sidePanelLocations &&
      order === out.sidePanelOrder &&
      scroll === out.sidePanelScrollPositions &&
      visibility === out.sidePanelVisibility &&
      extensionState === out.extensionState &&
      activeTabs === out.activeSidePanelTabs
    ) {
      continue;
    }
    out = {
      ...out,
      ...(locations ? { sidePanelLocations: locations } : {}),
      ...(order ? { sidePanelOrder: order } : {}),
      ...(scroll ? { sidePanelScrollPositions: scroll } : {}),
      ...(visibility ? { sidePanelVisibility: visibility } : {}),
      ...(extensionState ? { extensionState } : {}),
      ...(activeTabs ? { activeSidePanelTabs: activeTabs } : {}),
    };
  }
  return out;
}
