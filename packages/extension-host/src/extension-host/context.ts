import { commandRegistry, executeCommandAsync } from "./commands";
import { dockPanelKindRegistry } from "./dock-panel-kinds";
import { keybindingRegistry } from "./keybindings";
import { menuItemRegistry } from "./menu-items";
import { registerContextMenuItem } from "./context-menu-items";
import { sidePanelRegistry } from "./side-panels";
import { statusItemRegistry } from "./status-items";
import {
  settingsPageRegistry,
  EXTENSIONS_SETTINGS_GROUP,
} from "./settings-pages";
import type {
  Command,
  ContextMenuContribution,
  Disposable,
  DockPanelKind,
  ExtensionContext,
  FileType,
  Keybinding,
  MenuItemContribution,
  MenuSurface,
  Permission,
  SettingsPage,
  SidePanel,
  StatusItem,
  Editor,
} from "@silo-code/sdk";
import { editorRegistry } from "./editor-registry";
import { fileTypeRegistry } from "./file-types";
import { getWorkspaceService } from "./workspace-service";
import { getEditorService } from "./editor-service";
import { getLayoutService } from "./layout-service";
import { getScopedProcessService } from "./process-service";
import { getScopedProcessesService } from "./processes-service";
import { getAgentsService } from "./agents-service";
import { getTerminalService } from "./terminal-service";
import { getScopedFileService } from "./file-service";
import { getScopedSearchService } from "./search-service";
import { getThemeService } from "./theme-service";
import type { ThemePreset } from "@silo-code/sdk";
import { getDndService } from "./dnd-service";
import { getUiService } from "./ui-service";
import { getNetworkService } from "./network-service";
import { getScopedWebviewService } from "./webview-service";
import { getSystemService } from "./system-service";
import { themePresetRegistry } from "./theme-presets";
import { getExtensionHandle } from "./extension-registry";
import {
  getGlobalExtensionStorage,
  getWorkspaceExtensionStorage,
} from "./extension-storage";
import { getActiveWorkspace } from "../state/store";
import type { PathScope } from "./security/resolve-path";
import {
  registerChannel,
  unregisterChannel,
  pushEntry,
  clearChannel,
} from "./output-store";

/**
 * Options for {@link createContext}. Trust and capabilities are supplied by the
 * **call site**, not derived from the extension id — a runtime-loaded extension
 * can't earn first-party trust by naming itself `core.*`. Builtins (the
 * composition root, via `activateExtensions`) are trusted; runtime-loaded
 * third-party extensions are not, and carry only the permissions the user
 * granted at install.
 */
export interface ContextOptions {
  /** First-party (bundled) extension — unscoped `files`/`process`. */
  trusted?: boolean;
  /** Human-readable display name for this extension's Output channel. Falls back to extensionId. */
  displayName?: string;
  /** Capabilities granted at install (third-party only). */
  permissions?: readonly Permission[];
}

export function createContext(
  extensionId: string,
  options: ContextOptions = {},
): ExtensionContext {
  const subscriptions: Disposable[] = [];
  function track(d: Disposable): Disposable {
    subscriptions.push(d);
    return d;
  }

  // The filesystem/process scope for this extension. `roots` is a live getter so
  // it always reflects the active workspace (which switches under the extension).
  // core.* extensions share a single "Application" channel (idempotent register);
  // third-party extensions get their own per-extension channel, removed on teardown.
  const isCoreExtension = extensionId.startsWith("core.");
  const channelKey = isCoreExtension
    ? "silo:application"
    : `ext:${extensionId}`;
  const channelDisplayName = isCoreExtension
    ? "Application"
    : (options.displayName ?? extensionId);
  registerChannel(channelKey, channelDisplayName, options.trusted);
  if (!isCoreExtension) {
    subscriptions.push({ dispose: () => unregisterChannel(channelKey) });
  }

  const permissions = new Set<Permission>(options.permissions ?? []);
  const scope: PathScope = {
    get roots(): readonly string[] {
      const ws = getActiveWorkspace();
      return ws ? [ws.folder, ...(ws.extraFolders ?? [])] : [];
    },
    trusted: options.trusted ?? false,
    permissions,
  };
  return {
    extensionId,
    subscriptions,
    storage: {
      global: getGlobalExtensionStorage(extensionId),
      workspace: getWorkspaceExtensionStorage(extensionId),
    },
    registerEditor(editor: Editor): Disposable {
      return track(editorRegistry.register(editor));
    },
    registerFileType(type: FileType): Disposable {
      return track(fileTypeRegistry.register(type));
    },
    registerCommand(cmd: Command): Disposable {
      return track(commandRegistry.register(cmd));
    },
    registerMenuItem(item: MenuItemContribution): Disposable {
      return track(menuItemRegistry.register(item));
    },
    registerContextMenuItem<S extends MenuSurface>(
      item: ContextMenuContribution<S>,
    ): Disposable {
      return track(registerContextMenuItem(item));
    },
    registerKeybinding(binding: Keybinding): Disposable {
      return track(keybindingRegistry.register(binding));
    },
    registerSidePanel(panel: SidePanel): Disposable {
      return track(sidePanelRegistry.register(panel));
    },
    registerDockPanelKind<T extends object>(
      kind: DockPanelKind<T>,
    ): Disposable {
      // Erase the params generic at the host boundary — the registry stores
      // kinds over the default Record params; the panel receives its typed
      // params back at open time.
      return track(
        dockPanelKindRegistry.register(kind as unknown as DockPanelKind),
      );
    },
    registerStatusItem(item: StatusItem): Disposable {
      return track(statusItemRegistry.register(item));
    },
    registerSettingsPage(page: SettingsPage): Disposable {
      // Non-core extensions can't scatter pages among the core rail groups —
      // their pages are always grouped under Extensions (the core feature set,
      // `core.*`, keeps the group it declares).
      const scoped = extensionId.startsWith("core.")
        ? page
        : { ...page, group: EXTENSIONS_SETTINGS_GROUP };
      return track(settingsPageRegistry.register(scoped));
    },
    registerThemePreset(preset: ThemePreset): Disposable {
      return track(themePresetRegistry.register(preset));
    },
    executeCommand<T = unknown>(id: string, ...args: unknown[]): Promise<T> {
      return executeCommandAsync<T>(id, ...args);
    },
    workspaces: getWorkspaceService(),
    editors: getEditorService(),
    layout: getLayoutService(),
    process: getScopedProcessService(scope),
    processes: getScopedProcessesService(scope),
    agents: getAgentsService(),
    terminals: getTerminalService(),
    files: getScopedFileService(scope),
    search: getScopedSearchService(scope),
    theme: {
      ...getThemeService(),
      registerPreset(preset: ThemePreset): Disposable {
        return track(themePresetRegistry.register(preset));
      },
    },
    dnd: getDndService(),
    ui: getUiService(),
    net: getNetworkService(),
    webview: getScopedWebviewService(scope),
    system: getSystemService(),
    log: {
      debug: (msg, data) => pushEntry(channelKey, "debug", msg, data),
      info: (msg, data) => pushEntry(channelKey, "info", msg, data),
      warn: (msg, data) => pushEntry(channelKey, "warn", msg, data),
      error: (msg, data) => pushEntry(channelKey, "error", msg, data),
      show: () =>
        getLayoutService().openPanel(
          "output",
          { title: "Output" },
          { singleton: true },
        ),
      clear: () => clearChannel(channelKey),
    },
    getExtension(id) {
      return getExtensionHandle(id);
    },
  };
}
