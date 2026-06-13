import { activateExtensions } from "@silo-code/extension-host";
import type { Extension } from "@silo-code/sdk";
import {
  menu as coreMenu,
  terminal,
  editor,
  workspaces,
  themes,
  keybindings,
  about,
  extensions,
  panelToggles,
  settingsButton,
  updates,
} from "@silo-code/extensions-core";
import {
  imageViewer,
  markdownPreview,
  fileExplorer,
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
  // The text editor registers before markdown-preview so that, with both at
  // priority 0, a plain .md open ties to Text (the default view); Preview is
  // opt-in via "Open With" / the breadcrumb switcher.
  editor,
  imageViewer,
  markdownPreview,
  workspaces,
  fileExplorer,
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
  extensions,
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
