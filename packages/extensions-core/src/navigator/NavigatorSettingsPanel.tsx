import { useEffect, useState } from "react";
import { ArrowUp, ArrowDown } from "@phosphor-icons/react";
import {
  IconButton,
  RadioCard,
  RadioGroup,
  Section,
  Switch,
  Tooltip,
  useServiceState,
} from "@silo-code/sdk";
import { navigatorViewRegistry } from "@silo-code/extension-host/internal";
import { navigatorPrefsService, type ViewArrangement } from "./navigator-prefs";
import {
  moveViewInOrder,
  resolveViewList,
  setViewDisabled,
} from "./navigator-views";
import "./NavigatorSettingsPanel.css";

/**
 * The **Navigator** settings tab's body — reorder the Navigator's views and
 * turn ones off. Owned by `core.navigator` (it owns the `navigatorPrefs`
 * store) and published for `core.layout` to compose into the Layout settings
 * page (RFC 0030).
 */
export function NavigatorSettingsPanel() {
  const prefs = useServiceState(navigatorPrefsService);

  // Re-render when a view is registered / unregistered — same tick pattern as
  // NavigatorPanel.
  const [, setTick] = useState(0);
  useEffect(
    () => navigatorViewRegistry.subscribe(() => setTick((t) => t + 1)).dispose,
    [],
  );

  const registered = navigatorViewRegistry.list();
  const { ordered, enabled } = resolveViewList(registered, prefs);
  const orderedIds = ordered.map((v) => v.id);
  const enabledIds = new Set(enabled.map((v) => v.id));
  const hasIcons = ordered.some((v) => v.icon);

  function move(id: string, dir: -1 | 1) {
    navigatorPrefsService.set({
      viewOrder: moveViewInOrder(orderedIds, id, dir),
    });
  }
  function toggle(id: string, on: boolean) {
    navigatorPrefsService.set({
      disabledViews: setViewDisabled(prefs.disabledViews, id, !on),
    });
  }

  return (
    <>
      <Section label="Views">
        <p className="nav-settings-hint">
          Reorder the Navigator&rsquo;s views, or turn off the ones you
          don&rsquo;t use. The Navigator opens on the first enabled view.
        </p>
        <ul className="nav-settings-list">
          {ordered.map((view, i) => {
            const on = enabledIds.has(view.id);
            const isLastEnabled = on && enabled.length === 1;
            return (
              <li
                key={view.id}
                className="nav-settings-row"
                data-off={on ? undefined : "true"}
              >
                <span className="nav-settings-move">
                  <IconButton
                    size="sm"
                    aria-label={`Move ${view.title} up`}
                    disabled={i === 0}
                    onClick={() => move(view.id, -1)}
                  >
                    <ArrowUp size={13} weight="bold" />
                  </IconButton>
                  <IconButton
                    size="sm"
                    aria-label={`Move ${view.title} down`}
                    disabled={i === ordered.length - 1}
                    onClick={() => move(view.id, 1)}
                  >
                    <ArrowDown size={13} weight="bold" />
                  </IconButton>
                </span>
                {hasIcons && (
                  <span className="nav-settings-icon">{view.icon}</span>
                )}
                <span className="nav-settings-label">{view.title}</span>
                {isLastEnabled ? (
                  <Tooltip content="At least one view must stay on">
                    {/* Wrapper span so the tooltip has a hover target while the
                      Switch itself is disabled. */}
                    <span className="nav-settings-toggle-lock">
                      <Switch
                        checked
                        disabled
                        onChange={() => {}}
                        aria-label={`Show ${view.title}`}
                      />
                    </span>
                  </Tooltip>
                ) : (
                  <Switch
                    checked={on}
                    onChange={(next) => toggle(view.id, next)}
                    aria-label={`Show ${view.title}`}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      <Section label="View arrangement">
        <div className="nav-settings-arrangement">
          <RadioGroup
            value={prefs.arrangement}
            onChange={(v) =>
              navigatorPrefsService.set({
                arrangement: v as ViewArrangement,
              })
            }
          >
            <RadioCard
              value="one-at-a-time"
              title="One at a time"
              description="A list of your views sits at the top of the Navigator; click one to show it."
            />
            <RadioCard
              value="stacked"
              title="Stacked"
              description="No list — every enabled view is stacked in the order above, each collapsible."
            />
          </RadioGroup>
        </div>
      </Section>
    </>
  );
}
