import type { Extension } from "@silo-code/sdk";
import { NavigatorPanel } from "./NavigatorPanel";
import { NavigatorSettingsPanel } from "./NavigatorSettingsPanel";
import { initNavigatorPrefs } from "./navigator-prefs";
import type { NavigatorExtensionAPI } from "./navigator-api";

/**
 * `core.navigator` — the Navigator side panel: the one place you navigate the
 * app from.
 *
 * The panel is a **container**. Everything in its body is a
 * {@link NavigatorView} registered through the public
 * `ctx.registerNavigatorView`, including the workspace list, which
 * `core.workspaces` contributes exactly the way a third-party extension would.
 * Its chrome is the view list (every registered view, named) and the view
 * header, whose actions are toolbar contributions on the `"navigator"`
 * surface. So this extension holds no
 * workspace code, no agent code, and no knowledge of what any view shows —
 * which is the point: a new way to navigate is a new view, not a competing
 * side panel.
 *
 * It also owns the user's **view arrangement** preferences (order + which
 * views are on) — a `navigatorPrefs` store on its `ctx.storage.global`, edited
 * from a settings panel it publishes for `core.layout`'s Layout page to
 * compose (RFC 0030).
 */
export const extension: Extension<NavigatorExtensionAPI> = {
  id: "core.navigator",
  activate(ctx): NavigatorExtensionAPI {
    ctx.subscriptions.push(initNavigatorPrefs(ctx.storage.global));

    ctx.registerSidePanel({
      id: "navigator",
      location: "left",
      title: "Navigator",
      // Inject ctx so the panel reaches storage/ui through the public
      // primitives, not host getters (see silo.file-explorer, 6662dcc).
      component: () => <NavigatorPanel ctx={ctx} />,
      order: 1,
    });

    return { SettingsPanel: NavigatorSettingsPanel };
  },
};
