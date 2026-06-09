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
} from "@silo-code/extensions-core";
import {
  imageViewer,
  markdownPreview,
  fileExplorer,
  git,
  gitExplorer,
  themePresets,
  panelToggles,
  settingsButton,
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
  keybindings,
  about,
  extensions,
];

export function activateBuiltins(): void {
  activateExtensions(builtins);
}
