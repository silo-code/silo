/**
 * Formatting for the Chat panel's Context option, built on the SDK's
 * `usage_update`-derived {@link AgentSessionUsage}. Kept separate from
 * `AcpChatPanel.tsx` for the same reason as `transcript-model.ts` — pure
 * logic, unit-testable without React (`.agents/skills/silo-testing/SKILL.md`).
 */

import type { AgentSessionUsage } from "@silo-code/sdk";

/** Compact token count: `1536` → `"1.5k"`, `200_000` → `"200k"` (a whole
 *  multiple of 1000 drops the trailing `.0`), `512` → `"512"`. */
export function formatTokenCount(n: number): string {
  if (n < 1000) return String(Math.round(n));
  return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
}

/** `used / size` as a whole-number percentage, clamped to `[0, 100]`. A
 *  `size` of `0` reads as `0%` rather than dividing by zero. */
export function usagePercent(usage: AgentSessionUsage): number {
  if (usage.size <= 0) return 0;
  return Math.min(
    100,
    Math.max(0, Math.round((usage.used / usage.size) * 100)),
  );
}

export type UsageTone = "neutral" | "warn" | "err";

/** Comfortable, getting full, nearly out of context. */
export function usageTone(percent: number): UsageTone {
  if (percent >= 90) return "err";
  if (percent >= 70) return "warn";
  return "neutral";
}

/** The Context option's value text, e.g. `"13.5k/200k (7%)"`. */
export function usageValueText(usage: AgentSessionUsage): string {
  const used = formatTokenCount(usage.used);
  const size = formatTokenCount(usage.size);
  return `${used}/${size} (${usagePercent(usage)}%)`;
}
