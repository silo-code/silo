import { useEffect, useState, type MouseEvent } from "react";
import { CaretDown } from "@phosphor-icons/react";
import { IconButton, Tooltip } from "@silo-code/sdk";
import type {
  ShowMenuOptions,
  ToolbarItemContext,
  ToolbarSurface,
} from "@silo-code/sdk";
import {
  PhosphorToolbarIcon,
  subscribeToolbarItems,
  toolbarEntriesFor,
  type ToolbarControlEntry,
  type ToolbarEntry,
} from "@silo-code/extension-host/internal";
import "./ContributedToolbar.css";

type Props<S extends ToolbarSurface> = {
  surface: S;
  target: ToolbarItemContext[S];
  /** Host menu opener — typically `ctx.ui.showMenu`. */
  showMenu: (opts: ShowMenuOptions) => Promise<void>;
};

async function activateEntry(
  entry: ToolbarControlEntry,
  showMenu: Props<ToolbarSurface>["showMenu"],
  anchor: HTMLElement,
): Promise<void> {
  if (entry.kind === "menu") {
    const items = await entry.loadMenu();
    await showMenu({ items, anchor, align: "end" });
    return;
  }
  entry.runCommand();
}

/**
 * Trailing cluster of extension toolbar contributions for editor/terminal
 * breadcrumbs. Icons are {@link PhosphorIconName} strings resolved by the
 * host to bold 1em Phosphor glyphs. Core hosts only.
 */
export function ContributedToolbar<S extends ToolbarSurface>({
  surface,
  target,
  showMenu,
}: Props<S>) {
  const [tick, setTick] = useState(0);
  useEffect(
    () => subscribeToolbarItems(() => setTick((t) => t + 1)).dispose,
    [],
  );

  // `tick` forces re-query after register/invalidate; target fields are the
  // per-panel identity.
  void tick;
  const entries = toolbarEntriesFor(surface, target);

  if (entries.length === 0) return null;

  return (
    <div className="contributed-toolbar" role="toolbar">
      {entries.map((entry) => (
        <ToolbarSlot key={entry.id} entry={entry} showMenu={showMenu} />
      ))}
    </div>
  );
}

function ToolbarSlot({
  entry,
  showMenu,
}: {
  entry: ToolbarEntry;
  showMenu: Props<ToolbarSurface>["showMenu"];
}) {
  if (entry.kind === "separator") {
    return (
      <span
        className="contributed-toolbar__separator"
        role="separator"
        aria-orientation="vertical"
      />
    );
  }
  if (entry.kind === "spacer") {
    return (
      <span
        className="contributed-toolbar__spacer"
        data-size={entry.size}
        aria-hidden
      />
    );
  }
  return <ToolbarControl entry={entry} showMenu={showMenu} />;
}

function ToolbarControl({
  entry,
  showMenu,
}: {
  entry: ToolbarControlEntry;
  showMenu: Props<ToolbarSurface>["showMenu"];
}) {
  const onClick = (e: MouseEvent<HTMLElement>) => {
    void activateEntry(entry, showMenu, e.currentTarget);
  };

  const hasTitle = Boolean(entry.title);
  const hasIcon = Boolean(entry.icon);
  const iconOnly = hasIcon && !hasTitle;
  const fallbackTitle = !hasIcon && !hasTitle ? entry.label : undefined;
  const paintedTitle = entry.title ?? fallbackTitle;
  const glyph = entry.icon ? (
    <span className="contributed-toolbar__glyph">
      <PhosphorToolbarIcon name={entry.icon} />
    </span>
  ) : null;

  const body = (
    <>
      {glyph}
      {paintedTitle != null && (
        <span className="contributed-toolbar__title">{paintedTitle}</span>
      )}
      {entry.kind === "menu" && (
        <CaretDown
          className="contributed-toolbar__caret"
          weight="bold"
          size="0.85em"
          aria-hidden
        />
      )}
    </>
  );

  if (iconOnly && entry.kind === "command") {
    return (
      <Tooltip content={entry.tooltip}>
        <IconButton
          size="sm"
          variant="toolbar"
          aria-label={entry.label}
          aria-pressed={entry.checked}
          data-checked={entry.checked ? "true" : undefined}
          onClick={onClick}
        >
          {glyph}
        </IconButton>
      </Tooltip>
    );
  }

  return (
    <Tooltip content={entry.tooltip}>
      <button
        type="button"
        className="contributed-toolbar__btn"
        aria-label={entry.label}
        aria-haspopup={entry.kind === "menu" ? "menu" : undefined}
        aria-pressed={entry.checked}
        data-checked={entry.checked ? "true" : undefined}
        onClick={onClick}
      >
        {body}
      </button>
    </Tooltip>
  );
}
