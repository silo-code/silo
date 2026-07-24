/**
 * `@silo-code/extensions-core` — the bundled **core** feature set (`core.*`).
 *
 * Core extensions are the **identity-defining** tier: always-on, bundled, and not
 * user-disableable. An extension belongs here if it needs the host's privileged
 * surface (`@silo-code/extension-host/internal`) **or** is identity-defining chrome
 * that must not be disable-able — see ADR 0013's placement test. Privilege is a
 * capability core *may* use, not the defining trait: some core extensions (e.g. the
 * theme picker and the status-bar chrome) are `@silo-code/sdk`-only. The app's
 * composition root imports these and hands them to {@link activateExtensions}; the
 * package itself knows nothing about activation order (the app owns that).
 */
export { extension as menu } from "./menu";
export { extension as terminal } from "./terminal";
export { extension as editor } from "./editor";
export { extension as layout } from "./layout";
export { extension as workspaces } from "./workspaces";
export { extension as themes } from "./themes";
export { extension as keybindings } from "./keybindings";
export { extension as about } from "./about";
export { extension as cliInstall } from "./cli-install";
export { extension as extensions } from "./extensions";
export { extension as panelToggles } from "./statusbar/panel-toggles";
export { extension as settingsButton } from "./statusbar/settings-button";
export { extension as updates } from "./statusbar/updates";
export { extension as output } from "./output";
export { extension as webviewBridgeTest } from "./webview-bridge-test";
