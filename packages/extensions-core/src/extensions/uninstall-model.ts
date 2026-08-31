/**
 * Pure logic behind the uninstall confirm (RFC 0032) — the part that decides
 * what the dialog says and what its result means, kept out of the component so
 * it's testable without rendering.
 */
import type { ExtensionDataInfo } from "@silo-code/extension-host/internal";

/** What the caller does after the dialog closes. */
export interface UninstallOutcome {
  uninstall: boolean;
  deleteData: boolean;
}

/**
 * Map a dialog result to an action. `undefined` is a dismissal (Escape /
 * backdrop) and means the same as Cancel: nothing happens, and a checked box is
 * discarded rather than remembered — an accidental dismiss must never delete
 * a user's files.
 */
export function resolveUninstallOutcome(
  choice: "uninstall" | "cancel" | undefined,
  deleteDataChecked: boolean,
): UninstallOutcome {
  if (choice !== "uninstall") return { uninstall: false, deleteData: false };
  return { uninstall: true, deleteData: deleteDataChecked };
}

/** Human-readable byte size: `"812 B"`, `"1.2 KB"`, `"3.4 MB"`. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  // One decimal below 10 (1.2 MB reads better than 1 MB); whole numbers above.
  const rounded = value < 10 ? value.toFixed(1) : Math.round(value).toString();
  return `${rounded} ${units[unit]}`;
}

/**
 * The checkbox's label detail: `"3 files, 1.2 MB"`. A capped walk can't state a
 * total, so it says so rather than reporting a floor as fact.
 */
export function formatDataSummary(
  info: Pick<ExtensionDataInfo, "files" | "bytes" | "truncated">,
): string {
  if (info.truncated) return "size unknown";
  const files = `${info.files} file${info.files === 1 ? "" : "s"}`;
  return `${files}, ${formatBytes(info.bytes)}`;
}
