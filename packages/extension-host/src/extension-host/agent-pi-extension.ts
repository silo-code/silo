/**
 * Compat re-export — the real module moved to `agents/pi.ts` (ADR 0042 phase
 * 3's seam). Kept so nothing importing this path needs to change until phase
 * 4 removes it along with the rest of the migration.
 */
export * from "./agents/pi";
