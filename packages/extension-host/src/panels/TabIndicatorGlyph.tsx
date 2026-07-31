import type {
  TabIndicatorAdornment,
  TabIndicatorContribution,
} from "@silo-code/sdk";
import { PhosphorTabDecorationIcon } from "../components/phosphor-icon";

/**
 * Paint a static trailing tab indicator (Phosphor). Activity chrome uses the
 * SDK {@link import("@silo-code/sdk").Activity} component instead (ADR 0030).
 */
export function TabIndicatorGlyph({
  indicator,
}: {
  indicator: TabIndicatorAdornment | TabIndicatorContribution;
}) {
  return (
    <PhosphorTabDecorationIcon
      name={indicator.icon}
      filled={indicator.filled === true}
    />
  );
}
