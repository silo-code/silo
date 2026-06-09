import { Registry } from "./registry";
import type { Editor } from "@silo-code/sdk";

export const editorRegistry = new Registry<Editor>();

export interface ResolveOptions {
  /**
   * The buffer has no path yet (a "New File" buffer). When true, only editors
   * that declare `capabilities.handlesUntitled` are considered — so a read-only,
   * file-backed editor is never selected for a buffer it can't load.
   */
  untitled?: boolean;
}

/**
 * Pick the highest-priority editor whose `match` accepts `name`. For untitled
 * buffers `name` is the tab title (e.g. "Untitled.foo") so extension matchers
 * still fire even though there's no path — letting a type-specific editor claim
 * a freshly created buffer.
 */
export function resolveEditor(
  name: string | null,
  opts: ResolveOptions = {},
): Editor {
  let best: Editor | null = null;
  let bestPriority = -Infinity;
  for (const v of editorRegistry.list()) {
    if (opts.untitled && !v.capabilities?.handlesUntitled) continue;
    if (!v.match(name)) continue;
    const p = v.priority ?? 0;
    if (p > bestPriority) {
      best = v;
      bestPriority = p;
    }
  }
  if (!best) {
    throw new Error(`No editor registered for path: ${name ?? "<untitled>"}`);
  }
  return best;
}

/**
 * Resolve the editor for an editor record. Routes saved files by their path and
 * untitled buffers by their title (so the extension baked into "Untitled.foo"
 * picks the matching editor). The single resolution path both the editor panel
 * and the active-editor-type context key go through, so they never disagree.
 *
 * When the record carries an explicit `viewType` (an {@link Editor.id} the user
 * chose via "Open With" / the view-switcher), that editor wins — but only if it
 * is still registered, still matches the file, and can load the buffer (untitled
 * buffers require `handlesUntitled`). Otherwise we fall back to priority
 * resolution, so a stale `viewType` (extension uninstalled, file renamed) never
 * breaks the tab.
 */
export function resolveEditorForRecord(
  record: {
    filePath: string | null;
    title: string;
    viewType?: string;
  } | null,
): Editor {
  const untitled = record != null && record.filePath === null;
  const name = untitled ? record!.title : (record?.filePath ?? null);
  if (record?.viewType) {
    const chosen = editorRegistry.get(record.viewType);
    if (
      chosen &&
      chosen.match(name) &&
      (!untitled || chosen.capabilities?.handlesUntitled)
    ) {
      return chosen;
    }
  }
  return resolveEditor(name, { untitled });
}
