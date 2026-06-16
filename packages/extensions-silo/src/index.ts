/**
 * `@silo-code/extensions-silo` — the bundled **optional** feature set (`silo.*`).
 *
 * These are the independently-shippable tier: they depend on the public
 * `@silo-code/sdk` **only** (never the host's privileged surface), which is what
 * makes them surface as disable-able first-party extensions and keeps them
 * shippable on their own. The app's composition root imports these and hands
 * them to `activateExtensions`.
 */
export { extension as imageViewer } from "./image-viewer";
export { extension as markdownPreview } from "./markdown-preview";
export { extension as fileExplorer } from "./file-explorer";
export { extension as fileSearch } from "./file-search";
export { extension as git } from "./git";
export { extension as gitExplorer } from "./git-explorer";
export { extension as themePresets } from "./theme-presets";
