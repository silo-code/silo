import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import { useFocusGroup, type FocusGroupItemProps } from "./use-focus-group";
import {
  listRowDataSelected,
  listRowNameTruncate,
  type ListRowTruncate,
} from "./list-classes";

export type { ListRowTruncate };

interface ListRowInternalProps {
  /** Injected by {@link List} — index in the focus group. */
  __listIndex?: number;
  /** Injected by {@link List} — focus-group item props to spread. */
  __focusProps?: FocusGroupItemProps;
}

interface ListContextValue {
  onActivate?: (index: number) => void;
}

const ListContext = createContext<ListContextValue | null>(null);

/**
 * A full-width listbox of selectable rows. One tab stop; ↑/↓ move the focus
 * ring, Space/Enter select. Pair with {@link ListRow} children.
 *
 * Styled purely via the host-provided `.silo-list` class — no stylesheet
 * import is needed in the extension.
 *
 * @example
 * ```tsx
 * <List aria-label="Workspace folders">
 *   <ListRow
 *     selected={folder.primary}
 *     leading={<FolderIcon />}
 *     trailing={<Badge tone="accent">primary</Badge>}
 *     onSelect={() => choose(folder)}
 *   >
 *     {folder.path}
 *   </ListRow>
 * </List>
 * ```
 *
 * @category Consumer Services
 * @public
 */
export function List({
  "aria-label": ariaLabel,
  onActivate,
  children,
}: {
  /** Required — it's a listbox. */
  "aria-label": string;
  /** Enter / double-click on a row. */
  onActivate?: (index: number) => void;
  children?: ReactNode;
}) {
  const rows = Children.toArray(children).filter(
    isValidElement,
  ) as ReactElement<ListRowProps & ListRowInternalProps>[];
  const selectedIndex = rows.findIndex((row) => row.props.selected);
  const group = useFocusGroup({
    count: rows.length,
    start: selectedIndex >= 0 ? selectedIndex : 0,
    // Space/Enter both select (RFC 0016). Enter-only activation is layered
    // on in ListRow's own keydown after the focus-group handler runs.
    onActivate: (index) => {
      rows[index]?.props.onSelect?.();
    },
  });

  return (
    <ListContext.Provider value={{ onActivate }}>
      <div
        role="listbox"
        aria-label={ariaLabel}
        className="silo-list"
        {...group.containerProps}
      >
        {rows.map((row, index) =>
          cloneElement(row, {
            key: row.key ?? index,
            __listIndex: index,
            __focusProps: group.getItemProps(index),
          }),
        )}
      </div>
    </ListContext.Provider>
  );
}

/**
 * One row inside a {@link List}. Stretches full-width; long text truncates
 * (use `truncate="start"` for paths). `trailing` content never shrinks.
 *
 * @example
 * ```tsx
 * <ListRow
 *   selected={folder.primary}
 *   leading={<FolderIcon />}
 *   trailing={<Badge tone="accent">primary</Badge>}
 *   truncate="start"
 *   onSelect={() => choose(folder)}
 * >
 *   {folder.path}
 * </ListRow>
 * ```
 *
 * @category Consumer Services
 * @public
 */
export interface ListRowProps {
  selected?: boolean;
  /** Icon slot (dimmed, fixed). */
  leading?: ReactNode;
  /** Badge(s) and/or `IconButton size="sm"`(s). */
  trailing?: ReactNode;
  /** Default `"end"`. Use `"start"` for paths. */
  truncate?: ListRowTruncate;
  /** Click / Space select. */
  onSelect?: () => void;
  /** Enter / double-click. */
  onActivate?: () => void;
  children?: ReactNode;
}

/**
 * @category Consumer Services
 * @public
 */
export function ListRow(props: ListRowProps) {
  // List injects focus-group props via cloneElement; keep them off the public
  // signature so they stay out of the generated API reference.
  const {
    selected = false,
    leading,
    trailing,
    truncate = "end",
    onSelect,
    onActivate,
    children,
    __listIndex,
    __focusProps,
  } = props as ListRowProps & ListRowInternalProps;
  const list = useContext(ListContext);
  const dataSelected = listRowDataSelected(selected);
  const truncateAttr = listRowNameTruncate(truncate);

  const focusProps = __focusProps;
  const {
    ref,
    onKeyDown: focusKeyDown,
    onFocus,
    onPointerDown,
    tabIndex,
    "data-focus-item": dataFocusItem,
    "data-focus-visible": dataFocusVisible,
  } = focusProps ?? {
    ref: undefined as Ref<HTMLElement> | undefined,
    onKeyDown: undefined,
    onFocus: undefined,
    onPointerDown: undefined,
    tabIndex: -1 as number,
    "data-focus-item": "" as const,
    "data-focus-visible": undefined as "" | undefined,
  };

  function fireActivate() {
    onActivate?.();
    if (__listIndex != null) list?.onActivate?.(__listIndex);
  }

  const rowProps: HTMLAttributes<HTMLDivElement> & {
    ref?: Ref<HTMLDivElement>;
    "data-focus-item"?: "";
    "data-focus-visible"?: "";
    "data-selected"?: "true";
  } = {
    role: "option",
    "aria-selected": selected,
    className: "silo-list-row",
    tabIndex,
    ref: ref as Ref<HTMLDivElement> | undefined,
    onFocus,
    onPointerDown,
    "data-focus-item": dataFocusItem,
    ...(dataFocusVisible != null
      ? { "data-focus-visible": dataFocusVisible }
      : {}),
    ...(dataSelected != null ? { "data-selected": dataSelected } : {}),
    onClick: () => {
      onSelect?.();
    },
    onDoubleClick: () => {
      fireActivate();
    },
    onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
      focusKeyDown?.(e);
      if (e.key === "Enter") fireActivate();
    },
  };

  return (
    <div {...rowProps}>
      {leading != null && (
        <span className="silo-list-row-leading">{leading}</span>
      )}
      <span
        className="silo-list-row-name"
        {...(truncateAttr != null ? { "data-truncate": truncateAttr } : {})}
      >
        {children}
      </span>
      {trailing != null && (
        <span
          className="silo-list-row-trailing"
          onClick={(e: MouseEvent) => {
            // Trailing IconButtons own their clicks — don't select the row.
            e.stopPropagation();
          }}
        >
          {trailing}
        </span>
      )}
    </div>
  );
}
