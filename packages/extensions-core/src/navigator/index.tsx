import type { Extension } from "@silo-code/sdk";
import { NavigatorPanel } from "./NavigatorPanel";

/**
 * `core.navigator` — the Navigator side panel: the one place you navigate the
 * app from.
 *
 * The panel is a **container**. Everything in its body is a
 * {@link NavigatorView} registered through the public
 * `ctx.registerNavigatorView`, including the workspace list, which
 * `core.workspaces` contributes exactly the way a third-party extension would.
 * Everything in its header is either the view selector or a toolbar
 * contribution on the `"navigator"` surface. So this extension holds no
 * workspace code, no agent code, and no knowledge of what any view shows —
 * which is the point: a new way to navigate is a new view, not a competing
 * side panel.
 */
export const extension: Extension = {
  id: "core.navigator",
  activate(ctx) {
    ctx.registerSidePanel({
      id: "navigator",
      location: "left",
      title: "Navigator",
      // Inject ctx so the panel reaches storage/ui through the public
      // primitives, not host getters (see silo.file-explorer, 6662dcc).
      component: () => <NavigatorPanel ctx={ctx} />,
      order: 1,
    });
  },
};
