import ReactDOM from "react-dom/client";
import App from "./App";
import {
  hydrate,
  persistImmediately,
  flushEditorBackups,
  userConfigDir,
  initStorageRoot,
  getExtensionManager,
  initUserKeybindings,
  setExtensionsReady,
  initGlobalErrorCapture,
  beginStartupStatus,
  markStartupHydrated,
  markStartupExtensionsReady,
} from "@silo-code/extension-host";
import { activateBuiltins } from "./builtins";
import { initCliOpenHandler } from "./cli";

// Install global error/rejection capture before anything else runs so boot
// errors and extension errors are routed to the silo:errors Output channel.
initGlobalErrorCapture();

// StatusBar startup sequence (RFC 0026) — before hydrate / extension races.
beginStartupStatus();

// Resolve the extension-storage root (RFC 0032) before anything can ask for a
// path inside it. Built-ins activate synchronously below and are trusted (their
// `ctx.files` isn't scoped at all); the load-bearing case is `loadInstalled`
// below, which awaits this itself so a third-party extension's own-dir paths are
// allowed from the first line of `activate()` — including a path it cached in a
// previous session and uses before calling `globalDir()`. A rejection is logged
// to the Output panel inside; own-dir paths then deny through the normal rules.
void initStorageRoot().catch(() => {});

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
      .catch((err) => console.error("loadInstalled failed", err))
      .finally(() => {
        setExtensionsReady();
        markStartupExtensionsReady();
        // Kick off one background update check so the status bar / settings
        // rail can show a badge without anyone having opened the Extensions
        // page first (which does its own check on mount).
        void mgr.checkUpdates().catch((err) => {
          console.error("checkUpdates failed", err);
        });
      });
  });

userConfigDir()
  .then(hydrate)
  .then(() => {
    markStartupHydrated();
    return initCliOpenHandler();
  })
  .catch((err) => {
    // Unblock the StatusBar sequence even if hydrate/cli fails.
    markStartupHydrated();
    console.error("hydrate / cli handler failed", err);
  });

// Best-effort flush of unsaved-edit backups + workspace/layout state when the
// window is being hidden or torn down. We deliberately do NOT intercept the close
// (no `onCloseRequested`/`preventDefault`): gating the OS close button on async
// work is fragile — programmatic `close()` needs a capability and a denied/slow
// close wedges the window shut. Durability instead comes from the debounced
// backup writes made *while editing* (which survive even a hard kill); this is
// just a fire-and-forget catch for the last in-flight edit on a normal close.
// `pagehide` covers teardown; `visibilitychange→hidden` covers minimize/hide.
function flushBackgroundState(): void {
  void flushEditorBackups();
  void persistImmediately();
}
window.addEventListener("pagehide", flushBackgroundState);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushBackgroundState();
});

// Load keybindings.json overrides and live-reload on save. Runs after
// activateBuiltins so menu defaults are recorded first; loading overrides
// triggers a menu re-sync via onKeymapChange.
initUserKeybindings().catch((err) =>
  console.error("initUserKeybindings failed", err),
);

// UI freeze probe (rAF hitch detector). Bundled in release too — Prod stays
// off until Help → "Toggle UI Freeze Probe" (persists in localStorage). Dev
// defaults on.
import("./dev/ui-freeze-probe")
  .then((m) => m.initUiFreezeProbe())
  .catch((err) => console.error("ui freeze probe failed", err));

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
