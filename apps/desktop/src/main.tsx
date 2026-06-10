import ReactDOM from "react-dom/client";
import App from "./App";
import {
  hydrate,
  userConfigDir,
  getExtensionManager,
  initUserKeybindings,
  checkForUpdatesOnLaunch,
} from "@silo-code/extension-host";
import { activateBuiltins } from "./builtins";

// Activate built-ins synchronously, before render — the dock needs their panel
// kinds present when it deserializes the saved layout.
activateBuiltins();

// Then, asynchronously: apply the user's persisted built-in disables (tears the
// chosen ones down live, no re-persist), and load installed third-party
// extensions (registries + shared deps are ready first). Chained so the
// disabled set is applied before refresh reflects the list.
const mgr = getExtensionManager();
mgr
  .applyDisabledBuiltins()
  .catch((err) => console.error("applyDisabledBuiltins failed", err))
  .finally(() => {
    void mgr
      .loadInstalled()
      .catch((err) => console.error("loadInstalled failed", err));
  });

userConfigDir()
  .then(hydrate)
  .catch((err) => console.error("hydrate failed", err));

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
