import type {
  DockConfig,
  DockConfigRaw,
  DockTab,
  TerminalLog,
  Workspace,
  WorkspaceConfig,
} from "./demo-config";

/**
 * Every workspace is authored as a folder under `workspaces/<id>/`: a
 * `config.json` plus real `files/*` (editor content) and `terminals/*.json`
 * (structured, timed terminal output). All three are resolved here at build
 * time via `import.meta.glob` — nothing is fetched at runtime, so this stays
 * a fully static bundle.
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

function resolveDock(workspaceId: string, dock: DockConfigRaw): DockConfig {
  if (dock.kind !== "terminal")
    return {
      id: dock.id,
      kind: dock.kind,
      webview: dock.webview,
      size: dock.size,
    };
  const tabs: DockTab[] = (dock.tabs ?? []).map((tab) => {
    const path = `./workspaces/${workspaceId}/terminals/${tab.terminal}`;
    const log = terminalModules[path];
    if (!log)
      throw new Error(
        `${workspaceId}: missing terminals/${tab.terminal} (referenced by tab "${tab.id}")`,
      );
    return { id: tab.id, label: tab.label, log };
  });
  return {
    id: dock.id,
    kind: dock.kind,
    activeTab: dock.activeTab,
    tabs,
    size: dock.size,
  };
}

function resolveWorkspace(config: WorkspaceConfig): Workspace {
  const fileContents: Record<string, string> = {};
  for (const name of config.files) {
    const path = `./workspaces/${config.id}/files/${name}`;
    const content = fileModules[path];
    if (content === undefined)
      throw new Error(
        `${config.id}: missing files/${name} (listed in config.json)`,
      );
    fileContents[name] = content;
  }
  return {
    id: config.id,
    name: config.name,
    path: config.path,
    branch: config.branch,
    ahead: config.ahead,
    behind: config.behind,
    color: config.color,
    status: config.status,
    summary: config.summary,
    panels: config.panels,
    splitPanels: config.splitPanels,
    activePanels: config.activePanels,
    activeSplitPanels: config.activeSplitPanels,
    splitSize: config.splitSize,
    collapsed: config.collapsed,
    files: config.files,
    fileContents,
    activeFile: config.activeFile,
    changes: config.changes,
    issues: config.issues,
    prs: config.prs,
    system: config.system,
    search: config.search,
    docks: config.docks.map((dock) => resolveDock(config.id, dock)),
    githubActions: config.githubActions,
  };
}

export const baseWorkspaces: Workspace[] = Object.values(configModules)
  .sort((a, b) => a.order - b.order)
  .map((config) => resolveWorkspace(config));
