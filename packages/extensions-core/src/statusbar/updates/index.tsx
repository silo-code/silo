// `core.updates` — surfaces Silo's auto-updater in the status bar. When a new
// release is available it shows a small "Update" link; clicking it warns the
// user to save work, then installs and restarts. Checks run in the background
// (on activation + on a long interval), gated to the packaged stable app inside
// the host's UpdateService — so this is inert in `pnpm dev` and the "Silo Dev"
// build.
//
// Like `core.about`, this is a core extension: it reaches the host-owned update
// capability through the privileged `@silo-code/extension-host/internal` barrel
// (self-updating a binary is not a public-SDK capability), and touches the
// running app only through `ctx`.

import type { Extension } from "@silo-code/sdk";
import { useServiceState } from "@silo-code/sdk";
import { getUpdateService, Tooltip } from "@silo-code/extension-host/internal";
import { updateLinkLabel, isUpdateActionable } from "./model";
import { UpdatePrompt } from "./UpdatePrompt";
import "./updates.css";

const updates = getUpdateService();

// Re-check cadence for long-running sessions, so a window left open for days
// still notices a release without a restart.
const RECHECK_INTERVAL_MS = 3 * 60 * 60 * 1000;

export const extension: Extension = {
  id: "core.updates",
  activate(ctx) {
    // The component closes over `ctx`; identity is stable (activate runs once).
    function UpdateLink() {
      const snap = useServiceState(updates);
      const label = updateLinkLabel(snap.phase);
      if (!label) return null;
      const actionable = isUpdateActionable(snap.phase);

      async function promptAndInstall(): Promise<void> {
        const ok = await ctx.ui.showModal<boolean>(
          (close) => (
            <UpdatePrompt
              version={snap.version}
              onLater={() => close(false)}
              onInstall={() => close(true)}
            />
          ),
          { size: "sm", dismissible: true, ariaLabel: "Update Silo" },
        );
        if (!ok) return;
        try {
          await updates.installAndRelaunch();
        } catch {
          // The service reverts to "available" so the link returns for a retry;
          // tell the user the install didn't take (it otherwise relaunches).
          ctx.ui.notify(
            "error",
            "Couldn't install the update. Please try again.",
          );
        }
      }

      // Wrapped so the nested `.update-status .update-link` selector outweighs
      // the host's `.status-bar button { color }` rule — letting the link keep
      // the accent color instead of the muted status-bar text color. While the
      // install is in flight the button is disabled (shows "Installing…"), which
      // — together with the service's re-entry guard — prevents a double install.
      return (
        <span className="update-status">
          <Tooltip
            content={
              actionable
                ? "A new version of Silo is available"
                : "Installing the update…"
            }
          >
            <button
              className="update-link"
              disabled={!actionable}
              onClick={() => void promptAndInstall()}
            >
              {label}
            </button>
          </Tooltip>
        </span>
      );
    }

    ctx.registerStatusItem({
      id: "updates",
      alignment: "right",
      // Leftmost of the right built-in cluster (closest to extension items).
      priority: -2,
      component: UpdateLink,
    });

    // User-invoked check (palette / future menu): reports the outcome via a
    // toast, where the background check stays silent.
    ctx.registerCommand({
      id: "core.updates.check",
      label: "Check for Updates",
      run: () => {
        void (async () => {
          await updates.check();
          const { phase, version } = updates.getState();
          if (phase === "available") {
            ctx.ui.notify("info", `Silo ${version} is available.`);
          } else if (phase === "upToDate") {
            ctx.ui.notify("info", "You're on the latest version.");
          } else if (phase === "error") {
            ctx.ui.notify("error", "Couldn't check for updates.");
          }
        })();
      },
    });

    // Background checks: once shortly after activation, then on a long interval.
    void updates.check();
    const timer = setInterval(() => void updates.check(), RECHECK_INTERVAL_MS);
    ctx.subscriptions.push({ dispose: () => clearInterval(timer) });
  },
};
