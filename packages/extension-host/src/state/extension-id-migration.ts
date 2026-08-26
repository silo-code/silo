/**
 * One-time migrations when a third-party extension id becomes a built-in under
 * a new id. Keeps settings (`globalExtensionState`), navigator view choice, and
 * `disabledBuiltins` aligned without manual cleanup.
 */

/** Former extension id → id Silo now ships as a built-in. */
export const SUPERSEDED_BUILTIN_IDS: Readonly<Record<string, string>> = {
  "silo.agent-monitor": "silo.agents",
};

/** Optional toast title when retiring a superseded on-disk install. */
export const SUPERSEDED_BUILTIN_TOAST_TITLES: Readonly<Record<string, string>> =
  {
    "silo.agent-monitor": "Agent Monitor extension is now built-in to Silo",
  };

/** Retired navigator view ids rewritten on migration. */
const RETIRED_VIEW_IDS: Readonly<Record<string, string>> = {
  "silo.agent-monitor.by-workspace": "silo.agents.by-status",
};

function rewriteNavigatorViewId(activeView: string): string | null {
  if (activeView in RETIRED_VIEW_IDS) {
    return RETIRED_VIEW_IDS[activeView];
  }
  for (const [oldId, newId] of Object.entries(SUPERSEDED_BUILTIN_IDS)) {
    if (activeView.startsWith(`${oldId}.`)) {
      return newId + activeView.slice(oldId.length);
    }
  }
  return null;
}

/** Migrate extension global storage bags and navigator view ids. */
export function migrateGlobalExtensionState(
  state: Record<string, Record<string, unknown>>,
): boolean {
  let changed = false;
  for (const [oldId, newId] of Object.entries(SUPERSEDED_BUILTIN_IDS)) {
    const oldBag = state[oldId];
    if (!oldBag) continue;
    state[newId] = { ...oldBag, ...state[newId] };
    delete state[oldId];
    changed = true;
  }
  const nav = state["core.navigator"];
  if (nav) {
    const activeView = nav.activeView;
    if (typeof activeView === "string") {
      const rewritten = rewriteNavigatorViewId(activeView);
      if (rewritten && rewritten !== activeView) {
        nav.activeView = rewritten;
        changed = true;
      }
    }
  }
  return changed;
}

/** Rewrite persisted built-in disable choices to the new ids. */
export function migrateDisabledBuiltins(ids: readonly string[] | undefined): {
  ids: string[];
  changed: boolean;
} {
  const set = new Set(ids ?? []);
  let changed = false;
  for (const [oldId, newId] of Object.entries(SUPERSEDED_BUILTIN_IDS)) {
    if (set.delete(oldId)) {
      set.add(newId);
      changed = true;
    }
  }
  return { ids: [...set], changed };
}

/** Whether an on-disk install id was superseded by a now-built-in extension. */
export function isSupersededOnDiskId(
  id: string,
  isBuiltinId: (id: string) => boolean,
): boolean {
  const target = SUPERSEDED_BUILTIN_IDS[id];
  return target !== undefined && isBuiltinId(target);
}
