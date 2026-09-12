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
} from "@silo-code/extensions-core";
import {
  imageViewer,
  markdownPreview,
  fileExplorer,
  fileSearch,
  git,
  gitExplorer,
  agents,
  agentsChatPanel,
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
  // No ordering dependency between these two — agentsChatPanel's
  // registerDockPanelKind and agents's Navigator/status view are independent
  // surfaces over ctx.agents (`.sessions` vs. the unscoped status API).
  // Grouped here because both are agent-related.
  agentsChatPanel,
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
 * Activate the built-in set **synchronously**, before the first render — the
 * dock deserializes its saved layout at mount and needs the editor/terminal
 * panel kinds (registered by `core.editor`/`core.terminal`) already present, so
 * this must not be deferred behind a disk read. The user's persisted
 * disabled-built-in choices are applied just after, asynchronously, via
 * {@link ExtensionManager.applyDisabledBuiltins}.
 *
 * The Chat panel (`silo.agents-chat-panel`) is a regular bundled `silo.*`
 * extension, activated unconditionally like every other entry here — no
 * boot-order dance. There is no `chatAgents` flag to gate it behind: RFC 0039
 * already retired that setting in favor of `resolveChatProfileHost()` (does
 * any registered dock panel kind declare `chatProfileHost: true`?) plus the
 * `"agents"` permission on `connect()`. So registering this panel kind here
 * makes Chat a real, working feature for any user who authors a Chat Agent
 * Profile — not gated behind anything (Dave's call, 2026-09-10). RFC 0039
 * first moved the panel out to `examples/extensions/acp-chat` for a
 * release-free inner loop; Session 8 of the Agent Sessions sprint moved it
 * back in-tree, into `packages/extensions-silo`, for the same property with
 * Vite HMR instead of a manual rebuild.
 */
export function activateBuiltins(): void {
  activateExtensions(builtins);
}
