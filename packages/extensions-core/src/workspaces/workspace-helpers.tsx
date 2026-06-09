import { useEffect, useRef, useState } from "react";
import type {
  FileService,
  WorkspaceService,
  WorkspaceState,
} from "@silo-code/sdk";

/**
 * A single workspace row, derived from the public {@link WorkspaceState} the
 * panel already receives — so the workspaces UI names the shape without the host
 * `Workspace` import (and without blessing the full, editor-record-bearing
 * interface as a public SDK type).
 */
export type Workspace = WorkspaceState["all"][number];

export interface DropTarget {
  id: string;
  position: "before" | "after";
}

/** The staged edits the Workspace Properties form hands back on save. */
export interface WorkspacePropertiesChanges {
  name: string;
  extraFolders: string[];
}

/**
 * Apply staged Workspace Properties changes (rename + folder add/remove) by
 * diffing against the current state. Shared by the workspaces panel and the
 * status-bar Properties entry so the save logic lives in exactly one place.
 */
export function applyWorkspaceProperties(
  service: WorkspaceService,
  id: string,
  changes: WorkspacePropertiesChanges,
): void {
  const current = service.getState().all.find((w) => w.id === id);
  if (!current) return;

  const trimmed = changes.name.trim();
  if (trimmed && trimmed !== current.name) service.rename(id, trimmed);

  const origExtra = current.extraFolders ?? [];
  for (const folder of origExtra) {
    if (!changes.extraFolders.includes(folder))
      service.removeFolder(id, folder);
  }
  for (const folder of changes.extraFolders) {
    if (!origExtra.includes(folder)) service.addFolder(id, folder);
  }
}

export function fullPath(folder: string, home: string): string {
  const p = folder.replace(/\/+$/, "");
  if (!home) return p;
  const h = home.replace(/\/+$/, "");
  if (p === h) return "~";
  if (p.startsWith(h + "/")) return "~" + p.slice(h.length);
  return p;
}

export function FrontTruncatedPath({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(text);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf: number | null = null;

    function compute() {
      raf = null;
      if (!el) return;
      const w = el.offsetWidth;
      if (w === 0) return;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const style = window.getComputedStyle(el);
      ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      if (ctx.measureText(text).width <= w) {
        setDisplay(text);
        return;
      }
      const E = "…";
      let lo = 0,
        hi = text.length;
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (ctx.measureText(E + text.slice(mid)).width <= w) hi = mid;
        else lo = mid + 1;
      }
      // Snap to the next folder boundary so we never cut mid-name
      const slash = text.indexOf("/", lo);
      const cut = slash !== -1 ? slash : lo;
      setDisplay(cut >= text.length ? E : E + text.slice(cut));
    }

    const ro = new ResizeObserver(() => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
    });
    ro.observe(el);
    compute();
    return () => {
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [text]);

  return (
    <span ref={ref} className={className} title={text}>
      {display}
    </span>
  );
}

export function formatElapsed(isoDate: string): string {
  const ms = Date.now() - new Date(isoDate).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 2) return "just now";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Best-effort check of whether each closed workspace's folder still exists on
 * disk. Cached by folder path so we don't stat repeatedly. A missing entry
 * means "don't know yet" — treat as existing until proven otherwise.
 */
export function useFolderExistence(
  folders: readonly string[],
  files: FileService,
): Map<string, boolean> {
  const [results, setResults] = useState<Map<string, boolean>>(() => new Map());
  useEffect(() => {
    let cancelled = false;
    const unknown = folders.filter((f) => !results.has(f));
    if (unknown.length === 0) return;
    Promise.all(
      unknown.map(async (f) => {
        try {
          return [f, await files.pathExists(f)] as const;
        } catch {
          return [f, false] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setResults((prev) => {
        const next = new Map(prev);
        for (const [f, ok] of entries) next.set(f, ok);
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [folders, results, files]);
  return results;
}
