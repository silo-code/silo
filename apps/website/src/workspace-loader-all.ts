import type { TerminalLog, WorkspaceConfig } from "./demo-config";
import { sortResolvedWorkspaces } from "./workspace-resolve";

/**
 * Full workspace catalog for the vignette recorder (includes
 * `extension-demo` and `terminals-demo`). Homepage uses the hero-only loader.
 */
const configModules = import.meta.glob<WorkspaceConfig>(
  "./workspaces/*/config.json",
  { eager: true, import: "default" },
);
const fileModules = import.meta.glob("./workspaces/*/files/*", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;
const terminalModules = import.meta.glob<TerminalLog>(
  "./workspaces/*/terminals/*.json",
  { eager: true, import: "default" },
);

export const allWorkspaces = sortResolvedWorkspaces(
  Object.values(configModules),
  fileModules,
  terminalModules,
);
