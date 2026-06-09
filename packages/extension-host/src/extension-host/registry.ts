import type { Disposable } from "@silo-code/sdk";

export class Registry<T extends { id: string }> {
  private entries = new Map<string, T>();
  private listeners = new Set<() => void>();
  private cachedList: T[] | null = null;

  register(entry: T): Disposable {
    if (this.entries.has(entry.id)) {
      throw new Error(`Registry: duplicate id "${entry.id}"`);
    }
    this.entries.set(entry.id, entry);
    this.emit();
    return {
      dispose: () => {
        if (this.entries.delete(entry.id)) this.emit();
      },
    };
  }

  // Returns a stable array reference between mutations so callers can use it
  // directly as a `useSyncExternalStore` snapshot without tearing.
  list(): T[] {
    if (!this.cachedList) this.cachedList = [...this.entries.values()];
    return this.cachedList;
  }

  get(id: string): T | undefined {
    return this.entries.get(id);
  }

  onChange(fn: () => void): Disposable {
    this.listeners.add(fn);
    return {
      dispose: () => {
        this.listeners.delete(fn);
      },
    };
  }

  private emit(): void {
    this.cachedList = null;
    for (const l of this.listeners) l();
  }
}
