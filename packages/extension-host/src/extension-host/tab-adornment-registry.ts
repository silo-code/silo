import type {
  Disposable,
  TabActivityAdornment,
  TabActivityBinder,
  TabActivityContribution,
  TabActivityFlash,
  TabIconAdornment,
  TabIconBinder,
  TabIconContribution,
  TabIndicatorAdornment,
  TabIndicatorBinder,
  TabIndicatorContribution,
  TabIndicatorFlash,
  TabHighlightAdornment,
  TabHighlightBinder,
  TabHighlightContribution,
  TerminalTabDecorationProvider,
} from "@silo-code/sdk";

// CenterDock tab adornments (ADR 0029 / 0030). Editors and terminals share one
// registry keyed by kind + target id. DockTab reads getIcons / getIndicators /
// getActivities.

export type TabAdornmentKind = "editor" | "terminal";

type TargetKey = `${TabAdornmentKind}:${string}`;

function targetKey(kind: TabAdornmentKind, id: string): TargetKey {
  return `${kind}:${id}`;
}

const iconSets = new Map<TargetKey, Map<string, TabIconContribution>>();
const highlightSets = new Map<
  TargetKey,
  Map<string, TabHighlightContribution>
>();
const indicatorSets = new Map<
  TargetKey,
  Map<string, TabIndicatorContribution>
>();
const activitySets = new Map<TargetKey, Map<string, TabActivityContribution>>();
const iconBinders: TabIconBinder[] = [];
const highlightBinders: {
  kind: TabAdornmentKind | "both";
  binder: TabHighlightBinder;
}[] = [];
const indicatorBinders: {
  kind: TabAdornmentKind | "both";
  binder: TabIndicatorBinder;
}[] = [];
const activityBinders: {
  kind: TabAdornmentKind | "both";
  binder: TabActivityBinder;
}[] = [];
const iconBinderKinds = new Map<string, TabAdornmentKind | "both">();
const listeners = new Set<() => void>();
const flashTimers = new Map<string, ReturnType<typeof setTimeout>>();
let flashSeq = 0;

function notify(): void {
  for (const l of listeners) l();
}

function ensureMap<V>(
  maps: Map<TargetKey, Map<string, V>>,
  key: TargetKey,
): Map<string, V> {
  let m = maps.get(key);
  if (!m) {
    m = new Map();
    maps.set(key, m);
  }
  return m;
}

function collectIcons(
  kind: TabAdornmentKind,
  targetId: string,
): TabIconAdornment[] {
  const out: TabIconAdornment[] = [];
  const set = iconSets.get(targetKey(kind, targetId));
  if (set) {
    for (const [id, c] of set) out.push({ id, ...c });
  }
  for (const b of iconBinders) {
    const binderKind = iconBinderKinds.get(b.id) ?? "both";
    if (binderKind !== "both" && binderKind !== kind) continue;
    const c = b.provide(targetId);
    if (c !== null) out.push({ id: b.id, ...c });
  }
  return out;
}

// At most one highlight renders per tab, so the first contribution found
// (direct `set`, then binders, in registration order) wins — unlike icons/
// indicators/activities, these don't stack.
function collectHighlight(
  kind: TabAdornmentKind,
  targetId: string,
): TabHighlightAdornment | null {
  const set = highlightSets.get(targetKey(kind, targetId));
  if (set) {
    for (const [id, c] of set) return { id, ...c };
  }
  for (const entry of highlightBinders) {
    if (entry.kind !== "both" && entry.kind !== kind) continue;
    const c = entry.binder.provide(targetId);
    if (c !== null) return { id: entry.binder.id, ...c };
  }
  return null;
}

function collectIndicators(
  kind: TabAdornmentKind,
  targetId: string,
): TabIndicatorAdornment[] {
  const out: TabIndicatorAdornment[] = [];
  const set = indicatorSets.get(targetKey(kind, targetId));
  if (set) {
    for (const [id, c] of set) out.push({ id, ...c });
  }
  for (const entry of indicatorBinders) {
    if (entry.kind !== "both" && entry.kind !== kind) continue;
    const c = entry.binder.provide(targetId);
    if (c !== null) out.push({ id: entry.binder.id, ...c });
  }
  return out;
}

function collectActivities(
  kind: TabAdornmentKind,
  targetId: string,
): TabActivityAdornment[] {
  const out: TabActivityAdornment[] = [];
  const set = activitySets.get(targetKey(kind, targetId));
  if (set) {
    for (const [id, c] of set) out.push({ id, ...c });
  }
  for (const entry of activityBinders) {
    if (entry.kind !== "both" && entry.kind !== kind) continue;
    const c = entry.binder.provide(targetId);
    if (c !== null) out.push({ id: entry.binder.id, ...c });
  }
  return out;
}

function setContribution<V>(
  maps: Map<TargetKey, Map<string, V>>,
  kind: TabAdornmentKind,
  targetId: string,
  adornmentId: string,
  contribution: V,
): void {
  ensureMap(maps, targetKey(kind, targetId)).set(adornmentId, contribution);
  notify();
}

function clearContribution<V>(
  maps: Map<TargetKey, Map<string, V>>,
  kind: TabAdornmentKind,
  targetId: string,
  adornmentId: string,
): void {
  const key = targetKey(kind, targetId);
  const m = maps.get(key);
  if (!m || !m.delete(adornmentId)) return;
  if (m.size === 0) maps.delete(key);
  notify();
}

export const tabAdornmentRegistry = {
  setIcon(
    kind: TabAdornmentKind,
    targetId: string,
    adornment: TabIconAdornment,
  ): void {
    const { id, ...rest } = adornment;
    setContribution(iconSets, kind, targetId, id, rest);
  },

  clearIcon(
    kind: TabAdornmentKind,
    targetId: string,
    adornmentId: string,
  ): void {
    clearContribution(iconSets, kind, targetId, adornmentId);
  },

  bindIcon(kind: TabAdornmentKind | "both", binder: TabIconBinder): Disposable {
    iconBinders.push(binder);
    iconBinderKinds.set(binder.id, kind);
    notify();
    return {
      dispose() {
        const i = iconBinders.indexOf(binder);
        if (i !== -1) iconBinders.splice(i, 1);
        iconBinderKinds.delete(binder.id);
        notify();
      },
    };
  },

  setHighlight(
    kind: TabAdornmentKind,
    targetId: string,
    adornment: TabHighlightAdornment,
  ): void {
    const { id, ...rest } = adornment;
    setContribution(highlightSets, kind, targetId, id, rest);
  },

  clearHighlight(
    kind: TabAdornmentKind,
    targetId: string,
    adornmentId: string,
  ): void {
    clearContribution(highlightSets, kind, targetId, adornmentId);
  },

  bindHighlight(
    kind: TabAdornmentKind | "both",
    binder: TabHighlightBinder,
  ): Disposable {
    const entry = { kind, binder };
    highlightBinders.push(entry);
    notify();
    return {
      dispose() {
        const i = highlightBinders.indexOf(entry);
        if (i !== -1) highlightBinders.splice(i, 1);
        notify();
      },
    };
  },

  setIndicator(
    kind: TabAdornmentKind,
    targetId: string,
    adornment: TabIndicatorAdornment,
  ): void {
    const { id, ...rest } = adornment;
    setContribution(indicatorSets, kind, targetId, id, rest);
  },

  clearIndicator(
    kind: TabAdornmentKind,
    targetId: string,
    adornmentId: string,
  ): void {
    clearContribution(indicatorSets, kind, targetId, adornmentId);
  },

  flashIndicator(
    kind: TabAdornmentKind,
    targetId: string,
    flash: TabIndicatorFlash,
  ): void {
    const { durationMs = 800, ...rest } = flash;
    const id = `__flash_${++flashSeq}`;
    const timerKey = `${kind}:${targetId}:${id}`;
    setContribution(
      indicatorSets,
      kind,
      targetId,
      id,
      rest as TabIndicatorContribution,
    );
    const prev = flashTimers.get(timerKey);
    if (prev) clearTimeout(prev);
    flashTimers.set(
      timerKey,
      setTimeout(() => {
        flashTimers.delete(timerKey);
        clearContribution(indicatorSets, kind, targetId, id);
      }, durationMs),
    );
  },

  bindIndicator(
    kind: TabAdornmentKind | "both",
    binder: TabIndicatorBinder,
  ): Disposable {
    const entry = { kind, binder };
    indicatorBinders.push(entry);
    notify();
    return {
      dispose() {
        const i = indicatorBinders.indexOf(entry);
        if (i !== -1) indicatorBinders.splice(i, 1);
        notify();
      },
    };
  },

  setActivity(
    kind: TabAdornmentKind,
    targetId: string,
    adornment: TabActivityAdornment,
  ): void {
    const { id, ...rest } = adornment;
    setContribution(activitySets, kind, targetId, id, rest);
  },

  clearActivity(
    kind: TabAdornmentKind,
    targetId: string,
    adornmentId: string,
  ): void {
    clearContribution(activitySets, kind, targetId, adornmentId);
  },

  flashActivity(
    kind: TabAdornmentKind,
    targetId: string,
    flash: TabActivityFlash,
  ): void {
    const { durationMs = 800, ...rest } = flash;
    const id = `__flash_act_${++flashSeq}`;
    const timerKey = `${kind}:${targetId}:${id}`;
    setContribution(
      activitySets,
      kind,
      targetId,
      id,
      rest as TabActivityContribution,
    );
    const prev = flashTimers.get(timerKey);
    if (prev) clearTimeout(prev);
    flashTimers.set(
      timerKey,
      setTimeout(() => {
        flashTimers.delete(timerKey);
        clearContribution(activitySets, kind, targetId, id);
      }, durationMs),
    );
  },

  bindActivity(
    kind: TabAdornmentKind | "both",
    binder: TabActivityBinder,
  ): Disposable {
    const entry = { kind, binder };
    activityBinders.push(entry);
    notify();
    return {
      dispose() {
        const i = activityBinders.indexOf(entry);
        if (i !== -1) activityBinders.splice(i, 1);
        notify();
      },
    };
  },

  getIcons(kind: TabAdornmentKind, targetId: string): TabIconAdornment[] {
    return collectIcons(kind, targetId);
  },

  getHighlight(
    kind: TabAdornmentKind,
    targetId: string,
  ): TabHighlightAdornment | null {
    return collectHighlight(kind, targetId);
  },

  getIndicators(
    kind: TabAdornmentKind,
    targetId: string,
  ): TabIndicatorAdornment[] {
    return collectIndicators(kind, targetId);
  },

  getActivities(
    kind: TabAdornmentKind,
    targetId: string,
  ): TabActivityAdornment[] {
    return collectActivities(kind, targetId);
  },

  invalidate(): void {
    notify();
  },

  subscribe(listener: () => void): Disposable {
    listeners.add(listener);
    return { dispose: () => listeners.delete(listener) };
  },

  /**
   * Shim for `ctx.terminals.registerTabDecoration`: bind a terminal-only
   * indicator provider.
   */
  registerTerminalDecorationShim(
    provider: TerminalTabDecorationProvider,
  ): Disposable {
    return tabAdornmentRegistry.bindIndicator("terminal", {
      id: provider.id,
      provide: (terminalId) => provider.provide(terminalId),
    });
  },

  getFirstTerminalIndicator(
    terminalId: string,
  ): TabIndicatorContribution | null {
    const all = collectIndicators("terminal", terminalId);
    if (all.length === 0) return null;
    const { id: _id, ...rest } = all[0];
    return rest;
  },

  /** @internal — test helper. */
  _resetForTests(): void {
    iconSets.clear();
    highlightSets.clear();
    indicatorSets.clear();
    activitySets.clear();
    iconBinders.length = 0;
    highlightBinders.length = 0;
    indicatorBinders.length = 0;
    activityBinders.length = 0;
    iconBinderKinds.clear();
    listeners.clear();
    for (const t of flashTimers.values()) clearTimeout(t);
    flashTimers.clear();
  },
};

/** Adornment method bag bound to one CenterDock kind (editor or terminal). */
export function tabAdornmentMethodsFor(kind: TabAdornmentKind) {
  return {
    setIcon(targetId: string, adornment: TabIconAdornment) {
      tabAdornmentRegistry.setIcon(kind, targetId, adornment);
    },
    clearIcon(targetId: string, adornmentId: string) {
      tabAdornmentRegistry.clearIcon(kind, targetId, adornmentId);
    },
    bindIcon(binder: TabIconBinder) {
      return tabAdornmentRegistry.bindIcon(kind, binder);
    },
    setHighlight(targetId: string, adornment: TabHighlightAdornment) {
      tabAdornmentRegistry.setHighlight(kind, targetId, adornment);
    },
    clearHighlight(targetId: string, adornmentId: string) {
      tabAdornmentRegistry.clearHighlight(kind, targetId, adornmentId);
    },
    bindHighlight(binder: TabHighlightBinder) {
      return tabAdornmentRegistry.bindHighlight(kind, binder);
    },
    setIndicator(targetId: string, adornment: TabIndicatorAdornment) {
      tabAdornmentRegistry.setIndicator(kind, targetId, adornment);
    },
    clearIndicator(targetId: string, adornmentId: string) {
      tabAdornmentRegistry.clearIndicator(kind, targetId, adornmentId);
    },
    flashIndicator(targetId: string, flash: TabIndicatorFlash) {
      tabAdornmentRegistry.flashIndicator(kind, targetId, flash);
    },
    bindIndicator(binder: TabIndicatorBinder) {
      return tabAdornmentRegistry.bindIndicator(kind, binder);
    },
    setActivity(targetId: string, adornment: TabActivityAdornment) {
      tabAdornmentRegistry.setActivity(kind, targetId, adornment);
    },
    clearActivity(targetId: string, adornmentId: string) {
      tabAdornmentRegistry.clearActivity(kind, targetId, adornmentId);
    },
    flashActivity(targetId: string, flash: TabActivityFlash) {
      tabAdornmentRegistry.flashActivity(kind, targetId, flash);
    },
    bindActivity(binder: TabActivityBinder) {
      return tabAdornmentRegistry.bindActivity(kind, binder);
    },
    getIcons(targetId: string) {
      return tabAdornmentRegistry.getIcons(kind, targetId);
    },
    getHighlight(targetId: string) {
      return tabAdornmentRegistry.getHighlight(kind, targetId);
    },
    getIndicators(targetId: string) {
      return tabAdornmentRegistry.getIndicators(kind, targetId);
    },
    getActivities(targetId: string) {
      return tabAdornmentRegistry.getActivities(kind, targetId);
    },
    invalidateTabAdornments() {
      tabAdornmentRegistry.invalidate();
    },
    subscribeTabAdornments(listener: () => void) {
      return tabAdornmentRegistry.subscribe(listener);
    },
  };
}
