import type {
  ContextKeys,
  Disposable,
  MenuEntry,
  PhosphorIconName,
  ToolbarItemContext,
  ToolbarItemContribution,
  ToolbarSpacerSize,
  ToolbarSurface,
} from "@silo-code/sdk";
import { commandRegistry, executeCommand } from "./commands";
import { contextKeys } from "./context-keys";

// Toolbar contribution registry (RFC 0021). Write side: ctx.registerToolbarItem.
// Read side: toolbarEntriesFor(surface, target) for core editor/terminal hosts.

const contributions = new Set<ToolbarItemContribution>();
const listeners = new Set<() => void>();

const SPACER_RANK: Record<ToolbarSpacerSize, number> = {
  sm: 1,
  md: 2,
  lg: 3,
};

function emit(): void {
  for (const l of listeners) l();
}

function isChrome(
  item: ToolbarItemContribution,
): item is Extract<ToolbarItemContribution, { type: "separator" | "spacer" }> {
  return item.type === "separator" || item.type === "spacer";
}

function assertContributionShape(item: ToolbarItemContribution): void {
  if (isChrome(item)) return;
  const hasCommand =
    typeof item.command === "string" && item.command.length > 0;
  const hasMenu = typeof item.menu === "function";
  if (hasCommand === hasMenu) {
    throw new Error(
      `ToolbarItemContribution "${item.id}" must set exactly one of command or menu`,
    );
  }
}

/** Register a contribution; backs `ctx.registerToolbarItem`. */
export function registerToolbarItem<S extends ToolbarSurface>(
  item: ToolbarItemContribution<S>,
): Disposable {
  assertContributionShape(item as ToolbarItemContribution);
  const entry = item as unknown as ToolbarItemContribution;
  contributions.add(entry);
  emit();
  return {
    dispose: () => {
      if (contributions.delete(entry)) emit();
    },
  };
}

export function invalidateToolbarItems(): void {
  emit();
}

export function subscribeToolbarItems(listener: () => void): Disposable {
  listeners.add(listener);
  return { dispose: () => listeners.delete(listener) };
}

export function listToolbarItems<S extends ToolbarSurface>(
  surface: S,
): ToolbarItemContribution<S>[] {
  const out: ToolbarItemContribution<S>[] = [];
  for (const c of contributions) {
    if (c.surface === surface)
      out.push(c as unknown as ToolbarItemContribution<S>);
  }
  return out;
}

/** @internal — test helper. */
export function _resetToolbarItemsForTests(): void {
  contributions.clear();
  listeners.clear();
}

/** Resolved interactive control. */
export interface ToolbarControlEntry {
  id: string;
  kind: "command" | "menu";
  label: string;
  title?: string;
  tooltip: string;
  icon?: PhosphorIconName;
  checked?: boolean;
  runCommand: () => void;
  loadMenu: () => MenuEntry[] | Promise<MenuEntry[]>;
}

/** Resolved non-interactive chrome. */
export type ToolbarChromeEntry =
  | { id: string; kind: "separator" }
  | { id: string; kind: "spacer"; size: ToolbarSpacerSize };

/** Resolved row ready for rendering in a trailing cluster. */
export type ToolbarEntry = ToolbarControlEntry | ToolbarChromeEntry;

/**
 * Drop leading/trailing chrome and collapse adjacent separators / spacers
 * (spacers keep the larger size).
 */
export function collapseToolbarChrome(entries: ToolbarEntry[]): ToolbarEntry[] {
  const out: ToolbarEntry[] = [];
  for (const e of entries) {
    const prev = out[out.length - 1];
    if (
      prev &&
      (e.kind === "separator" || e.kind === "spacer") &&
      prev.kind === e.kind
    ) {
      if (e.kind === "spacer" && prev.kind === "spacer") {
        const a = SPACER_RANK[prev.size];
        const b = SPACER_RANK[e.size];
        if (b > a) prev.size = e.size;
      }
      continue;
    }
    out.push(e);
  }
  while (
    out.length > 0 &&
    (out[0]!.kind === "separator" || out[0]!.kind === "spacer")
  ) {
    out.shift();
  }
  while (
    out.length > 0 &&
    (out[out.length - 1]!.kind === "separator" ||
      out[out.length - 1]!.kind === "spacer")
  ) {
    out.pop();
  }
  return out;
}

/**
 * Visible toolbar entries for `surface` + `target`, sorted by `order`.
 * Evaluates `when` / `checked` against current context keys.
 */
export function toolbarEntriesFor<S extends ToolbarSurface>(
  surface: S,
  target: ToolbarItemContext[S],
  keys: ContextKeys = contextKeys,
): ToolbarEntry[] {
  const items = listToolbarItems(surface)
    .filter((c) => !c.when || c.when(keys, target))
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const mapped: ToolbarEntry[] = items.map((item) => {
    if (item.type === "separator") {
      return { id: item.id, kind: "separator" };
    }
    if (item.type === "spacer") {
      return { id: item.id, kind: "spacer", size: item.size ?? "md" };
    }

    const commandLabel =
      item.command != null
        ? (commandRegistry.get(item.command)?.label ?? item.command)
        : undefined;
    const label = item.label ?? item.title ?? commandLabel ?? item.id;
    const title = item.title;
    const kind = item.menu ? ("menu" as const) : ("command" as const);
    return {
      id: item.id,
      label,
      title,
      tooltip: item.tooltip ?? title ?? label,
      icon: item.icon,
      checked:
        kind === "command" && item.checked
          ? item.checked(keys, target)
          : undefined,
      kind,
      runCommand: () => {
        if (item.command) executeCommand(item.command, target);
      },
      loadMenu: () => {
        if (!item.menu) return [];
        return item.menu(target);
      },
    };
  });

  return collapseToolbarChrome(mapped);
}
