import type { ReactNode } from "react";
import { tabDataActive } from "./tabs-classes";

/**
 * One tab in a {@link Tabs} strip.
 *
 * @category Core Types
 * @public
 */
export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  icon?: ReactNode;
}

/**
 * A borderless strip attached to the content panel it switches. The active
 * tab's background **is** the panel's background — that shared fill is what
 * makes the tab read as part of the panel. Pair with {@link TabPanel}.
 * Native tab stops per tab; no arrow-key roving.
 *
 * Styled purely via host-provided `.silo-tabs` / `.silo-tab` classes — no
 * stylesheet import is needed in the extension.
 *
 * @example
 * ```tsx
 * <Tabs
 *   tabs={[
 *     { id: "panels", label: "Side Panels" },
 *     { id: "statusBar", label: "Status Bar" },
 *     { id: "options", label: "Options" },
 *   ]}
 *   active={tab}
 *   onSelect={setTab}
 * />
 * <TabPanel>{tab === "panels" && <PanelsSettings />}</TabPanel>
 * ```
 *
 * @category Consumer Services
 * @public
 */
export function Tabs<T extends string>({
  tabs,
  active,
  onSelect,
}: {
  tabs: TabItem<T>[];
  active: T;
  onSelect: (id: T) => void;
}) {
  return (
    <div className="silo-tabs" role="tablist">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        const dataActive = tabDataActive(isActive);
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className="silo-tab"
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

/**
 * The content panel a {@link Tabs} strip attaches to. Active-tab and panel
 * share the same background token — that's the "attached" illusion.
 *
 * @example
 * ```tsx
 * <TabPanel>{tab === "panels" && <PanelsSettings />}</TabPanel>
 * ```
 *
 * @category Consumer Services
 * @public
 */
export function TabPanel({ children }: { children?: ReactNode }) {
  return <div className="silo-tab-panel">{children}</div>;
}
