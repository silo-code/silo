/**
 * `@silo-code/extensions-silo` — the bundled **optional** feature set (`silo.*`).
 *
 * These are the **optional**, independently-shippable tier: SDK-only first-party
 * features the user can disable. They depend on the public `@silo-code/sdk` **only**
 * (never the host's privileged surface). SDK-only is necessary but **not
 * sufficient** for `silo.*`: identity-defining chrome that happens to be SDK-only
 * stays in `core.*` (see ADR 0013's placement test). `silo.*` is specifically the
 * SDK-only-*and*-optional set, which is what makes it the truest measuring stick
 * for the public surface. The app's composition root imports these and hands them
 * to `activateExtensions`.
 */
export { extension as imageViewer } from "./image-viewer";
export { extension as markdownPreview } from "./markdown-preview";
export { extension as fileExplorer } from "./file-explorer";
export { extension as fileSearch } from "./file-search";
export { extension as git } from "./git";
export { extension as gitExplorer } from "./git-explorer";
export { extension as themePresets } from "./theme-presets";
