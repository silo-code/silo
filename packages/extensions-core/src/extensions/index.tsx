import type { Extension } from "@silo-code/sdk";
import { EXTENSIONS_SETTINGS_GROUP } from "@silo-code/extension-host/internal";
import { makeExtensionsPage, ExtensionsRailBadge } from "./ExtensionsPage";

export const extension: Extension = {
  id: "core.extensions",
  activate(ctx) {
    ctx.registerSettingsPage({
      id: "extensions",
      title: "Extensions",
      // The manager heads its group; non-core pages (forced into this same
      // group by the host) follow it. A negative order keeps it first.
      group: EXTENSIONS_SETTINGS_GROUP,
      order: -1,
      component: makeExtensionsPage(ctx),
      badge: ExtensionsRailBadge,
    });
  },
};
