/**
 * `@silo-code/extensions-core` — the bundled **core** feature set (`core.*`).
 *
 * Core extensions are the privileged tier: they may import the host's
 * privileged surface (`@silo-code/extension-host/internal`) in addition to the
 * public `@silo-code/sdk`. The app's composition root imports these and hands
 * them to {@link activateExtensions}; the package itself knows nothing about
 * activation order (the app owns that).
 */
export { extension as menu } from "./menu";
export { extension as terminal } from "./terminal";
export { extension as editor } from "./editor";
export { extension as workspaces } from "./workspaces";
export { extension as themes } from "./themes";
export { extension as keybindings } from "./keybindings";
export { extension as about } from "./about";
export { extension as extensions } from "./extensions";
