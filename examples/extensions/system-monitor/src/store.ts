import type { ExtensionStorage } from "@silo-code/sdk";
import type { CpuSample, Snapshot } from "./metrics";

export type PanelId = "cpu" | "memory";

export interface PanelEntry {
  id: PanelId;
  enabled: boolean;
}

export interface Settings {
  panels: PanelEntry[];
  statusBar: PanelEntry[]; // ordered list, same shape as panels
}

export const DEFAULT_SETTINGS: Settings = {
  panels: [
    { id: "memory", enabled: true },
    { id: "cpu", enabled: true },
  ],
  statusBar: [
    { id: "cpu", enabled: true },
    { id: "memory", enabled: true },
  ],
};

export interface LiveData {
  snapshot: Snapshot | null;
  cpuHistory: CpuSample[];
  error: string | null;
}

type Listener = () => void;

function mergeList(
  saved: PanelEntry[] | undefined,
  defaults: PanelEntry[],
): PanelEntry[] {
  if (!Array.isArray(saved)) return defaults.map((p) => ({ ...p }));
  const knownMap = new Map(defaults.map((p) => [p.id, p]));
  const merged: PanelEntry[] = [];
  for (const sp of saved) {
    if (knownMap.has(sp.id)) {
      merged.push({ id: sp.id, enabled: sp.enabled });
      knownMap.delete(sp.id);
    }
  }
  for (const def of knownMap.values()) merged.push({ ...def });
  return merged;
}

function mergeSettings(saved: Partial<Settings>): Settings {
  return {
    panels: mergeList(saved.panels, DEFAULT_SETTINGS.panels),
    statusBar: mergeList(saved.statusBar, DEFAULT_SETTINGS.statusBar),
  };
}

class SysMonStore {
  private _settings: Settings = {
    panels: DEFAULT_SETTINGS.panels.map((p) => ({ ...p })),
    statusBar: DEFAULT_SETTINGS.statusBar.map((p) => ({ ...p })),
  };
  private _live: LiveData = { snapshot: null, cpuHistory: [], error: null };
  private _storage: ExtensionStorage | null = null;
  private _listeners = new Set<Listener>();

  get settings(): Settings {
    return this._settings;
  }
  get live(): LiveData {
    return this._live;
  }

  hydrate(storage: ExtensionStorage): void {
    this._storage = storage;
    const saved = storage.get<Settings>("settings");
    if (saved) {
      this._settings = mergeSettings(saved);
      this._notify();
    }
  }

  updateSettings(s: Settings): void {
    this._settings = s;
    this._storage?.set("settings", s);
    this._notify();
  }

  updateLive(patch: Partial<LiveData>): void {
    this._live = { ...this._live, ...patch };
    this._notify();
  }

  subscribe(fn: Listener): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  private _notify(): void {
    this._listeners.forEach((fn) => fn());
  }
}

export const sysmonStore = new SysMonStore();
