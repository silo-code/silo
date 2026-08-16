import { activateExtensions } from "@silo-code/extension-host";
import type { Extension } from "@silo-code/sdk";
import {
  menu as coreMenu,
  terminal,
  output,
  editor,
  layout,
  navigator,
  workspaces,
  themes,
  keybindings,
  about,
  agentsSettings,
  cliInstall,
  extensions,
  panelToggles,
  settingsButton,
  updates,
  webviewBridgeTest,
  busyStatusTest,
} from "@silo-code/extensions-core";
import {
  imageViewer,
  markdownPreview,
  fileExplorer,
  fileSearch,
  git,
  gitExplorer,
  themePresets,
} from "@silo-code/extensions-silo";

/**
 * The bundled-extension composition root. The app owns this list (and the
 * imports of each extension); the host package only knows how to activate a
 * list handed to it. This is what keeps the host → extensions edge out of the
 * package graph (see {@link activateExtensions}).
 */
const builtins: Extension[] = [
  coreMenu,
  // Dock panel kinds must register before any code that adds panels of those
  // kinds runs (CenterDock's first render). core.editor registers both the
  // editor and diff kinds (text + diff + settings are its modules).
  terminal,
  output,
  // The text editor registers before markdown-preview so that, with both at
  // priority 0, a plain .md open ties to Text (the default view); Preview is
  // opt-in via "Open With" / the breadcrumb switcher.
  editor,
  layout,
  imageViewer,
  markdownPreview,
  // The Navigator panel registers before any extension that contributes a view
  // to it, so the panel exists the first time a view lands in its registry.
  navigator,
  workspaces,
  fileExplorer,
  fileSearch,
  // The git provider must register before the view (and the diff editor) that
  // consume its published GitAPI.
  git,
  gitExplorer,
  // Register presets before the themes UI so the picker has them on first paint.
  themePresets,
  themes,
  panelToggles,
  settingsButton,
  updates,
  keybindings,
  about,
  agentsSettings,
  cliInstall,
  extensions,
  // Phase 1 of the ctx.webview bridge (docs/proposals/0011-iframe-navigation-events.md).
  // Temporary — reachable only via the "Developer: Webview Bridge Test" command
  // (no addMenuItem/toolbar entry). Delete this line + the extension once
  // Phase 2 ships ctx.webview publicly and local-web-viewer is the real consumer.
  webviewBridgeTest,
  // Scratch panel for StatusBar busy status (RFC 0026) — Window → Busy Status
  // Test in DEV only. Remove once restore + pending-remove migrate onto the API.
  busyStatusTest,
];

/**
 * Activate the built-in set **synchronously**, before the first render — the
 * dock deserializes its saved layout at mount and needs the editor/terminal
 * panel kinds (registered by `core.editor`/`core.terminal`) already present, so
 * this must not be deferred behind a disk read. The user's persisted
 * disabled-built-in choices are applied just after, asynchronously, via
 * {@link ExtensionManager.applyDisabledBuiltins}.
 */
export function activateBuiltins(): void {
  activateExtensions(builtins);
}
