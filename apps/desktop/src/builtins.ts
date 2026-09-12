import { activateExtensions } from "@silo-code/extension-host";
import type { Extension } from "@silo-code/sdk";
import {
  menu as coreMenu,
  acpChat,
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
} from "@silo-code/extensions-core";
import {
  imageViewer,
  markdownPreview,
  fileExplorer,
  fileSearch,
  git,
  gitExplorer,
  agents,
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
  // The bundled Chat panel (RFC 0038). Present in the list so its panel kind
  // exists for layout deserialization, but activated only once `chatAgents` is
  // known to be on — see CHAT_PANEL_EXTENSION_ID below.
  acpChat,
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
  agents,
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
  // core.sheet-lab — the <Sheet> bench. Deliberately NOT activated: the sheet
  // primitive is still experimental, and the bench's two side panels would be
  // in everyone's dock. Re-add this line (and its import above) to work on the
  // sheet surface again; the extension itself is still built and typechecked.
  // sheetLab,
];

/**
 * The bundled Chat panel's extension id (RFC 0038).
 *
 * It is in `builtins` above but starts **inactive**: `chatAgents` lives in the
 * persisted index, which hydrates *after* this synchronous activation, so the
 * flag simply cannot be read here — an earlier attempt to branch on it was
 * dead code that never once evaluated true. `applyChatAgentsGate` activates it
 * from the hydrate chain instead (and again whenever the user flips the
 * switch). Registered-but-inactive is the state `activateExtensions` already
 * models for a disabled built-in, so nothing it contributes reaches the first
 * frame while the gate is off.
 */
export const CHAT_PANEL_EXTENSION_ID = acpChat.id;

/**
 * Activate the built-in set **synchronously**, before the first render — the
 * dock deserializes its saved layout at mount and needs the editor/terminal
 * panel kinds (registered by `core.editor`/`core.terminal`) already present, so
 * this must not be deferred behind a disk read. The user's persisted
 * disabled-built-in choices are applied just after, asynchronously, via
 * {@link ExtensionManager.applyDisabledBuiltins}; the Chat panel's gate is
 * applied from the hydrate chain via `applyChatAgentsGate`.
 */
export function activateBuiltins(): void {
  activateExtensions(builtins, new Set([CHAT_PANEL_EXTENSION_ID]));
}
