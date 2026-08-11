import type { TerminalLog, WorkspaceConfig } from "./demo-config";
import { sortResolvedWorkspaces } from "./workspace-resolve";

/**
 * Homepage hero workspaces only — keeps recorder-only catalogs
 * (`extension-demo`, `terminals-demo`) out of the docs client bundle.
 * The recorder package loads the full set via `workspace-loader-all.ts`.
 */
const configModules = import.meta.glob<WorkspaceConfig>(
  "./workspaces/{website,docs,api,build-server,mobile}/config.json",
  { eager: true, import: "default" },
);
const fileModules = import.meta.glob(
  "./workspaces/{website,docs,api,build-server,mobile}/files/*",
  {
    eager: true,
    query: "?raw",
    import: "default",
  },
) as Record<string, string>;
const terminalModules = import.meta.glob<TerminalLog>(
  "./workspaces/{website,docs,api,build-server,mobile}/terminals/*.json",
  { eager: true, import: "default" },
);

export const baseWorkspaces = sortResolvedWorkspaces(
  Object.values(configModules),
  fileModules,
  terminalModules,
);
