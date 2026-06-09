import { Registry } from "./registry";
import type { FileType } from "@silo-code/sdk";

export const fileTypeRegistry = new Registry<FileType>();

/**
 * Creatable file types — those with a `newFile` template — in registration
 * order. Consumed by the "New File" surfaces (the tab-group + menu and the
 * empty-workspace watermark) to build "New {label}…" entries.
 */
export function listCreatableFileTypes(): FileType[] {
  return fileTypeRegistry.list().filter((t) => t.newFile);
}
