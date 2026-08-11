import type {
  DockConfig,
  DockConfigRaw,
  DockTab,
  TerminalLog,
  WebviewConfig,
  Workspace,
  WorkspaceConfig,
} from "./demo-config";
import { INK_PREVIEW_HTML } from "./ink-preview-html";

export function resolveWebview(
  raw: Omit<WebviewConfig, "html"> | undefined,
): WebviewConfig | undefined {
  if (!raw) return undefined;
  return {
    url: raw.url,
    viewportWidth: raw.viewportWidth,
    html: INK_PREVIEW_HTML,
  };
}

export function resolveDock(
  workspaceId: string,
  dock: DockConfigRaw,
  terminalModules: Record<string, TerminalLog>,
): DockConfig {
  if (dock.kind !== "terminal")
    return {
      id: dock.id,
      kind: dock.kind,
      webview: resolveWebview(dock.webview),
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

export function resolveWorkspace(
  config: WorkspaceConfig,
  fileModules: Record<string, string>,
  terminalModules: Record<string, TerminalLog>,
): Workspace {
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
    docks: config.docks.map((dock) =>
      resolveDock(config.id, dock, terminalModules),
    ),
    githubActions: config.githubActions,
  };
}

export function sortResolvedWorkspaces(
  configs: WorkspaceConfig[],
  fileModules: Record<string, string>,
  terminalModules: Record<string, TerminalLog>,
): Workspace[] {
  return configs
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((config) => resolveWorkspace(config, fileModules, terminalModules));
}
