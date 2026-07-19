import type { ReactNode } from "react";
import { segmentedTabDataActive } from "./segmented-tabs-classes";

/**
 * One segment in a {@link SegmentedTabs} strip.
 *
 * @category Core Types
 * @public
 */
export interface SegmentedTabItem<T extends string = string> {
  id: T;
  label: string;
  icon?: ReactNode;
}

/**
 * A pill riding in a recessed well — self-contained, no relationship to
 * content below it, so it can sit in a header row next to other controls.
 * Native tab stops per segment; no arrow-key roving.
 *
 * Styled purely via host-provided `.silo-segmented*` classes — no stylesheet
 * import is needed in the extension.
 *
 * @example
 * ```tsx
 * <SegmentedTabs
 *   tabs={[
 *     { id: "browse", label: "Browse" },
 *     { id: "installed", label: "Installed" },
 *   ]}
 *   active={tab}
 *   onSelect={setTab}
 * />
 * ```
 *
 * @category Consumer Services
 * @public
 */
export function SegmentedTabs<T extends string>({
  tabs,
  active,
  onSelect,
}: {
  tabs: SegmentedTabItem<T>[];
  active: T;
  onSelect: (id: T) => void;
}) {
  return (
    <div className="silo-segmented" role="tablist">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        const dataActive = segmentedTabDataActive(isActive);
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className="silo-segmented-tab"
            {...(dataActive != null ? { "data-active": dataActive } : {})}
            onClick={() => onSelect(tab.id)}
          >
            {tab.icon}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
