import ReactDOM from "react-dom/client";
import App from "./App";
import {
  hydrate,
  getExtensionManager,
  initUserKeybindings,
  checkForUpdatesOnLaunch,
} from "@silo-code/extension-host";
import { activateBuiltins } from "./builtins";

activateBuiltins();

// Load installed third-party extensions after builtins, so the registries and
// the shared React/SDK deps are ready first. Async + fire-and-forget.
getExtensionManager()
  .loadInstalled()
  .catch((err) => console.error("loadInstalled failed", err));

hydrate().catch((err) => console.error("hydrate failed", err));

// Load keybindings.json overrides and live-reload on save. Runs after
// activateBuiltins so menu defaults are recorded first; loading overrides
// triggers a menu re-sync via onKeymapChange.
initUserKeybindings().catch((err) =>
  console.error("initUserKeybindings failed", err),
);

// Stable app only: quietly check for a new release on launch (no-ops in dev
// and in the "Silo Dev" build).
checkForUpdatesOnLaunch().catch((err) =>
  console.error("update check failed", err),
);

// Dev-only automation bridge (paired with the Cargo `automation` feature on the
// Rust side). The static `import.meta.env.DEV` guard keeps this dynamic import
// out of release bundles entirely.
if (import.meta.env.DEV) {
  import("./automation/bridge")
    .then((m) => m.initAutomationBridge())
    .catch((err) => console.error("automation bridge failed", err));
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <App />,
);
