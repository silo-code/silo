import { activateExtensions } from "@silo-code/extension-host";
import { getBundledChatPanelEnabled } from "@silo-code/extension-host/internal";
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
  // (The bundled Chat panel registers right after core.terminal, but only
  // when the `bundledChatPanel` setting is on — see `builtinList` below.)
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
 * The list to activate, with the bundled Chat panel spliced in when the
 * `bundledChatPanel` setting is on.
 *
 * Exported for its unit test: "registers only behind the flag" is the phase's
 * acceptance criterion, and the alternative is asserting on what
 * `activateExtensions` was handed.
 */
export function builtinList(): Extension[] {
  if (!getBundledChatPanelEnabled()) return builtins;
  // Right after core.terminal, so "New Agent Chat" sits beside "New Terminal"
  // in the + menu rather than at the bottom of it.
  const at = builtins.indexOf(terminal) + 1;
  return [...builtins.slice(0, at), acpChat, ...builtins.slice(at)];
}

/**
 * Activate the built-in set **synchronously**, before the first render — the
 * dock deserializes its saved layout at mount and needs the editor/terminal
 * panel kinds (registered by `core.editor`/`core.terminal`) already present, so
 * this must not be deferred behind a disk read. The user's persisted
 * disabled-built-in choices are applied just after, asynchronously, via
 * {@link ExtensionManager.applyDisabledBuiltins}.
 */
export function activateBuiltins(): void {
  // RFC 0038 phase 3: the bundled Chat panel is a *registration-time* choice,
  // not a runtime one. Registering it and then hiding its UI would still put
  // its panel kind and `core.acpChat.new` command in the app, and criterion 3
  // of the sprint is that turning the flag off leaves the surface genuinely
  // free for a third-party Chat panel. Read once, here, before the first
  // render — the flag is index-persisted and a change needs a restart, the
  // same as a disabled built-in.
  activateExtensions(builtinList());
}
